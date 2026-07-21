from flask import Flask, request, jsonify, send_file

import os
import uuid
import json
import requests
import threading

# Limit GDAL internal cache to prevent OOM on large file processing.
# Must be set before rasterio is imported anywhere.
os.environ.setdefault('GDAL_CACHEMAX', '512')  # 512 MB

# --- Google Drive Service Account Setup ---
GDRIVE_SA_CREDS = None
try:
    sa_key_str = os.environ.get('GDRIVE_SA_KEY')
    if sa_key_str:
        from google.oauth2 import service_account
        sa_info = json.loads(sa_key_str)
        GDRIVE_SA_CREDS = service_account.Credentials.from_service_account_info(
            sa_info,
            scopes=['https://www.googleapis.com/auth/drive.readonly']
        )
        print("Google Drive service account credentials loaded successfully.")
    else:
        print("GDRIVE_SA_KEY env var not set — will fall back to gdown for downloads.")
except Exception as e:
    print(f"Failed to load Google Drive service account credentials: {e}")

# Try to import Firebase Admin
HAS_FIREBASE = False
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    
    cred = None
    env_creds = os.environ.get('FIREBASE_CREDENTIALS')
    key_path = os.path.join(os.path.dirname(__file__), 'firebase-key.json')
    
    # 1. Try loading credentials from environment variable string
    if env_creds:
        try:
            creds_dict = json.loads(env_creds)
            cred = credentials.Certificate(creds_dict)
            print("Loaded Firebase credentials from FIREBASE_CREDENTIALS environment variable.")
        except Exception as json_err:
            print(f"Failed to parse FIREBASE_CREDENTIALS env var: {json_err}")
            
    # 2. Fall back to local file if not loaded from env
    if not cred and os.path.exists(key_path):
        cred = credentials.Certificate(key_path)
        print("Loaded Firebase credentials from firebase-key.json file.")
        
    if cred:
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        HAS_FIREBASE = True
        print("Firebase Admin successfully initialized (Firestore only).")
    else:
        print("Firebase credentials not found (no env var or local file). Bypassing Firebase.")
except Exception as e:
    print(f"Firebase initialization bypassed/failed: {e}")

app = Flask(__name__)



# Manual CORS setup to support dev/production calls from mobile/tablet
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-target-host')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Folders for local processing
TEMP_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), 'temp'))
UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), 'uploads'))
DB_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), 'surveys_db.json'))

os.makedirs(TEMP_FOLDER, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Helper to load local database
def load_local_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return []
    return []

# Helper to save local database
def save_local_db(data):
    try:
        with open(DB_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Failed to write surveys_db.json: {e}")

# Helper to update survey status in DB/Firestore
def update_survey_status(survey_doc, status, error_msg=None, url=None, bounds=None):
    survey_doc['status'] = status
    if error_msg:
        survey_doc['error'] = error_msg
    if url:
        survey_doc['url'] = url
    if bounds:
        survey_doc['bounds'] = bounds

    if HAS_FIREBASE:
        try:
            db.collection('surveys').document(survey_doc['id']).set(survey_doc)
        except Exception as e:
            print(f"Failed to update Firestore: {e}")
    else:
        local_db = load_local_db()
        # Find and replace or insert
        updated = False
        for i, doc in enumerate(local_db):
            if doc['id'] == survey_doc['id']:
                local_db[i] = survey_doc
                updated = True
                break
        if not updated:
            local_db.append(survey_doc)
        save_local_db(local_db)

# Helper to extract Google Drive file ID
def get_gdrive_file_id(url):
    if 'drive.google.com' not in url:
        return None
    try:
        if '/file/d/' in url:
            parts = url.split('/file/d/')
            if len(parts) > 1:
                return parts[1].split('/')[0].split('?')[0]
        elif 'id=' in url:
            import urllib.parse
            parsed = urllib.parse.urlparse(url)
            queries = urllib.parse.parse_qs(parsed.query)
            if 'id' in queries:
                return queries['id'][0]
    except Exception:
        pass
    return None

# Helper to stream-download file from Google Drive
def download_gdrive_file(file_id, destination_path):
    if GDRIVE_SA_CREDS:
        # --- Use Google Drive API (service account) — no rate limits ---
        print(f"Downloading via Drive API (service account) file_id={file_id} ...")
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseDownload
        import io
        service = build('drive', 'v3', credentials=GDRIVE_SA_CREDS)
        request_obj = service.files().get_media(fileId=file_id)
        with open(destination_path, 'wb') as fh:
            downloader = MediaIoBaseDownload(fh, request_obj, chunksize=5 * 1024 * 1024)
            done = False
            while not done:
                status, done = downloader.next_chunk()
                if status:
                    print(f"  Download progress: {int(status.progress() * 100)}%")
    else:
        # --- Fallback: gdown (public download, may hit quota) ---
        print(f"Downloading via gdown (no SA creds) file_id={file_id} ...")
        import gdown
        url = f"https://drive.google.com/uc?id={file_id}"
        gdown.download(url, destination_path, quiet=False)

    if not os.path.exists(destination_path):
        raise Exception("Download failed: file not found after download.")

    file_size = os.path.getsize(destination_path)
    if file_size < 1024:
        with open(destination_path, 'r', errors='ignore') as f:
            preview = f.read(200)
        raise Exception(
            f"Downloaded file is too small ({file_size} bytes) — likely an error page. "
            f"Preview: {preview[:100]}"
        )
    print(f"Download complete: {file_size / (1024*1024):.1f} MB")

# Helper to get raster bounds using pure rasterio (no client locks)
def get_raster_bounds(filepath):
    import rasterio
    from rasterio.warp import transform_bounds
    with rasterio.open(filepath) as src:
        bounds = transform_bounds(src.crs, 'EPSG:4326', *src.bounds)
        # transform_bounds returns (west, south, east, north)
        return [bounds[1], bounds[3], bounds[0], bounds[2]] # [minLat, maxLat, minLng, maxLng]

# Check if a GeoTIFF is already Cloud Optimized (has overviews + tiling)
def is_cog(filepath):
    import rasterio
    try:
        with rasterio.open(filepath) as src:
            has_overviews = len(src.overviews(1)) > 0
            is_tiled = src.profile.get('tiled', False)
            return has_overviews and is_tiled
    except Exception:
        return False

# Convert GeoTIFF to Cloud Optimized GeoTIFF (COG) using rasterio.
# Uses block-windowed reads to avoid loading full bands into RAM (prevents OOM).
def convert_to_cog(input_path, output_path):
    import rasterio
    from rasterio.enums import Resampling

    file_size_gb = os.path.getsize(input_path) / (1024 ** 3)
    # Files > 4 GB require BigTIFF format (standard TIFF max is ~4 GB)
    bigtiff = 'YES' if file_size_gb > 3.9 else 'NO'
    print(f"File size: {file_size_gb:.1f} GB — BIGTIFF={bigtiff}")

    print(f"Building overviews for {os.path.basename(input_path)}...")
    with rasterio.open(input_path, 'r+') as src:
        factors = [2, 4, 8, 16, 32]
        src.build_overviews(factors, Resampling.nearest)
        src.update_tags(ns='rio_overview', resampling='nearest')

    print(f"Writing COG tiles (block-windowed)...")
    with rasterio.open(input_path) as src:
        meta = src.meta.copy()
        meta.update({
            'driver': 'GTiff',
            'tiled': True,
            'blockxsize': 256,
            'blockysize': 256,
            'compress': 'deflate',
            'predictor': 2,
            'copy_src_overviews': True,
            'BIGTIFF': bigtiff,
        })
        with rasterio.open(output_path, 'w', **meta) as dst:
            # Read & write one 256x256 block at a time — never loads a full band into RAM
            windows = list(src.block_windows(1))
            total = len(windows)
            for idx, (_, window) in enumerate(windows):
                for band_idx in range(1, src.count + 1):
                    dst.write(src.read(band_idx, window=window), band_idx, window=window)
                if idx % 500 == 0:
                    print(f"  COG progress: {idx}/{total} blocks ({100*idx//total}%)")

# Asynchronous Background Caching & Processing Thread
def process_survey_async(survey_doc):
    survey_id = survey_doc['id']
    file_id = get_gdrive_file_id(survey_doc['originalUrl'])
    survey_type = survey_doc['type']
    name = survey_doc['name']
    
    temp_input = os.path.join(TEMP_FOLDER, f"{survey_id}_raw")
    temp_output = os.path.join(TEMP_FOLDER, f"{survey_id}_cog.tif")
    
    try:
        # 1. Download
        update_survey_status(survey_doc, 'downloading')
        print(f"Async: Downloading {name} from GDrive...")
        download_gdrive_file(file_id, temp_input)
        
        final_url = ""
        bounds = None
        
        if survey_type == 'raster':
            # 2. Check if already COG (uploaded via local converter tool)
            if is_cog(temp_input):
                print(f"Async: {name} is already a COG — skipping conversion.")
                import shutil
                shutil.copy2(temp_input, temp_output)
            else:
                # Convert raw TIF to COG
                update_survey_status(survey_doc, 'converting')
                print(f"Async: Converting {name} to COG...")
                convert_to_cog(temp_input, temp_output)

            # 3. Read bounds
            bounds = get_raster_bounds(temp_output)

            # 4. Save to uploads cache
            local_dest = os.path.join(UPLOAD_FOLDER, f"{survey_id}.tif")
            import shutil
            shutil.copy2(temp_output, local_dest)

            final_url = f"/api/tiles/{{z}}/{{x}}/{{y}}.png?filename={local_dest}"
        else:
            # Vector layer
            local_dest = os.path.join(UPLOAD_FOLDER, f"{survey_id}.kmz")
            import shutil
            shutil.copy2(temp_input, local_dest)
            final_url = f"/tile-server-proxy/uploads/{survey_id}.kmz"
                
        # Cleanup temp files
        try:
            if os.path.exists(temp_input): os.remove(temp_input)
            if os.path.exists(temp_output): os.remove(temp_output)
        except Exception as cleanup_err:
            print(f"Cleanup warning: {cleanup_err}")
            
        # Complete
        update_survey_status(survey_doc, 'completed', url=final_url, bounds=bounds)
        print(f"Async: Completed processing & caching survey: {name}")
        
    except Exception as e:
        print(f"Async processing failed for {name}: {e}")
        try:
            if os.path.exists(temp_input): os.remove(temp_input)
            if os.path.exists(temp_output): os.remove(temp_output)
        except Exception:
            pass
        update_survey_status(survey_doc, 'failed', error_msg=str(e))

# --- Native Rasterio Tile Server Endpoints ---

# Thread lock & bounds cache for thread-safe, high-performance GDAL tile serving
RASTER_TILE_LOCK = threading.Lock()
RASTER_BOUNDS_CACHE = {}

def get_cached_raster_wgs84_bounds(filepath):
    if filepath in RASTER_BOUNDS_CACHE:
        return RASTER_BOUNDS_CACHE[filepath]
    import rasterio
    from rasterio.warp import transform_bounds
    try:
        with rasterio.open(filepath) as src:
            w, s, e, n = transform_bounds(src.crs, 'EPSG:4326', *src.bounds)
            res = (s, n, w, e)  # minLat, maxLat, minLng, maxLng
            RASTER_BOUNDS_CACHE[filepath] = res
            return res
    except Exception:
        return None

# Pre-created 256x256 transparent PNG bytes for instant response when tile is outside dataset
import io
from PIL import Image
_empty_img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
_empty_buf = io.BytesIO()
_empty_img.save(_empty_buf, format='PNG')
EMPTY_TILE_BYTES = _empty_buf.getvalue()

@app.route('/api/tiles/<int:z>/<int:x>/<int:y>.png', methods=['GET'])
def serve_tile(z, x, y):
    """Serve XYZ map tiles from a local GeoTIFF using rasterio safely & efficiently."""
    import math
    import numpy as np
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.crs import CRS

    filename = request.args.get('filename')
    if not filename or not os.path.exists(filename):
        return jsonify({'error': 'File not found'}), 404

    try:
        # 1. Convert tile XYZ to lat/lon bounds
        n_zoom = 2.0 ** z
        lon_min = x / n_zoom * 360.0 - 180.0
        lon_max = (x + 1) / n_zoom * 360.0 - 180.0
        lat_max = math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / n_zoom))))
        lat_min = math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * (y + 1) / n_zoom))))

        # 2. Instant bounding box overlap check — skip 95% of non-overlapping map tiles in 0.1ms
        raster_bounds = get_cached_raster_wgs84_bounds(filename)
        if raster_bounds:
            r_lat_min, r_lat_max, r_lon_min, r_lon_max = raster_bounds
            if (lat_max < r_lat_min or lat_min > r_lat_max or
                lon_max < r_lon_min or lon_min > r_lon_max):
                return send_file(io.BytesIO(EMPTY_TILE_BYTES), mimetype='image/png')

        # 3. Convert tile lat/lon to Web Mercator EPSG:3857 bounds
        R = 6378137.0
        xmin = math.radians(lon_min) * R
        xmax = math.radians(lon_max) * R
        ymin = math.log(math.tan(math.pi / 4.0 + math.radians(lat_min) / 2.0)) * R
        ymax = math.log(math.tan(math.pi / 4.0 + math.radians(lat_max) / 2.0)) * R

        tile_size = 256
        dst_crs = CRS.from_epsg(3857)
        dst_transform = rasterio.transform.from_bounds(xmin, ymin, xmax, ymax, tile_size, tile_size)

        # 4. Thread-safe GDAL reprojection (prevents SIGSEGV container crash under multi-threaded requests)
        with RASTER_TILE_LOCK:
            with rasterio.open(filename) as src:
                num_bands = min(src.count, 3)
                data = np.zeros((num_bands, tile_size, tile_size), dtype=np.uint8)

                for band_idx in range(1, num_bands + 1):
                    reproject(
                        source=rasterio.band(src, band_idx),
                        destination=data[band_idx - 1],
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=dst_transform,
                        dst_crs=dst_crs,
                        resampling=Resampling.nearest
                    )

                alpha = np.where(data[0] > 0, 255, 0).astype(np.uint8)

        # Write PNG tile
        if num_bands >= 3:
            img = Image.fromarray(np.stack([data[0], data[1], data[2], alpha], axis=2), 'RGBA')
        else:
            img = Image.fromarray(np.stack([data[0], data[0], data[0], alpha], axis=2), 'RGBA')

        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return send_file(buf, mimetype='image/png')

    except Exception as e:
        print(f"Tile error z={z} x={x} y={y}: {e}")
        return send_file(io.BytesIO(EMPTY_TILE_BYTES), mimetype='image/png')


@app.route('/api/bounds', methods=['GET'])
def get_bounds():
    """Return geographic bounds for a local GeoTIFF file."""
    filename = request.args.get('filename')
    if not filename or not os.path.exists(filename):
        return jsonify({'error': 'File not found'}), 404
    try:
        bounds = get_raster_bounds(filename)
        return jsonify({
            'bounds': {
                'left': bounds[2],
                'bottom': bounds[0],
                'right': bounds[3],
                'top': bounds[1]
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# --- API Endpoints ---

@app.route('/api/surveys', methods=['GET'])
def get_surveys():
    if HAS_FIREBASE:
        try:
            surveys_ref = db.collection('surveys')
            docs = surveys_ref.stream()
            surveys_list = [doc.to_dict() for doc in docs]
            return jsonify(surveys_list)
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        return jsonify(load_local_db())

@app.route('/api/surveys/cache-status/<id>', methods=['GET'])
def get_cache_status(id):
    survey_doc = None
    if HAS_FIREBASE:
        try:
            doc_ref = db.collection('surveys').document(id)
            doc = doc_ref.get()
            if doc.exists:
                survey_doc = doc.to_dict()
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        local_db = load_local_db()
        for doc in local_db:
            if doc['id'] == id:
                survey_doc = doc
                break
                
    if not survey_doc:
        return jsonify({'error': 'Survey not found'}), 404
        
    filename = f"{id}.tif" if survey_doc['type'] == 'raster' else f"{id}.kmz"
    local_path = os.path.join(UPLOAD_FOLDER, filename)
    
    if os.path.exists(local_path) and survey_doc.get('status') == 'completed':
        return jsonify({
            'cached': True,
            'survey': survey_doc
        })
    else:
        current_status = survey_doc.get('status', 'queued')
        if current_status not in ['downloading', 'converting', 'uploading'] or not os.path.exists(local_path):
            print(f"Cache miss for {survey_doc['name']}. Triggering background cache restore...")
            survey_doc['status'] = 'downloading'
            update_survey_status(survey_doc, 'downloading')
            thread = threading.Thread(target=process_survey_async, args=(survey_doc,))
            thread.start()
            
        return jsonify({
            'cached': False,
            'status': survey_doc.get('status', 'downloading'),
            'survey': survey_doc
        })

@app.route('/api/process-survey', methods=['POST', 'OPTIONS'])
def process_survey():
    if request.method == 'OPTIONS':
        return '', 200
        
    data = request.json or {}
    name = data.get('name')
    url = data.get('url')
    survey_type = data.get('type')
    description = data.get('description', '')

    if not name or not url or not survey_type:
        return jsonify({'error': 'Name, URL, and Type are required.'}), 400

    file_id = get_gdrive_file_id(url)
    if not file_id:
        return jsonify({'error': 'Invalid Google Drive URL.'}), 400

    survey_id = f"survey_{uuid.uuid4().hex}"
    
    # Create initial processing doc
    survey_doc = {
        'id': survey_id,
        'name': name,
        'type': survey_type,
        'status': 'queued',
        'description': description,
        'originalUrl': url,
        'url': '',
        'bounds': None
    }
    
    # Save document first
    if HAS_FIREBASE:
        db.collection('surveys').document(survey_id).set(survey_doc)
    else:
        local_db = load_local_db()
        local_db.append(survey_doc)
        save_local_db(local_db)
        
    # Start process asynchronously in the background
    thread = threading.Thread(target=process_survey_async, args=(survey_doc,))
    thread.start()
    
    return jsonify({
        'success': True,
        'survey': survey_doc
    })

@app.route('/api/surveys/<id>', methods=['DELETE', 'OPTIONS'])
def delete_survey(id):
    if request.method == 'OPTIONS':
        return '', 200
        
    # 1. Always clean up local cached files to free up disk space
    try:
        tif_path = os.path.join(UPLOAD_FOLDER, f"{id}.tif")
        if os.path.exists(tif_path): os.remove(tif_path)
        kmz_path = os.path.join(UPLOAD_FOLDER, f"{id}.kmz")
        if os.path.exists(kmz_path): os.remove(kmz_path)
    except Exception as cleanup_err:
        print(f"Local cache file deletion warning: {cleanup_err}")
        
    # 2. Delete database entry
    if HAS_FIREBASE:
        try:
            db.collection('surveys').document(id).delete()
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        local_db = load_local_db()
        updated_db = [s for s in local_db if s['id'] != id]
        save_local_db(updated_db)
        return jsonify({'success': True})

@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_uploads(filename):
    from flask import send_from_directory
    return send_from_directory(UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    print(f"Starting DroneSurvey unified backend on port 8000...")
    app.run(host='0.0.0.0', port=8000)
