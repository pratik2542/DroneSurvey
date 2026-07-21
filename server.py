from flask import Flask, request, jsonify
from localtileserver.web.blueprint import tileserver
import os
import uuid
import json
import requests
import threading

# Try to import Firebase Admin
HAS_FIREBASE = False
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, storage
    key_path = os.path.join(os.path.dirname(__file__), 'firebase-key.json')
    if os.path.exists(key_path):
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred, {
            'storageBucket': 'dronesurvey-app.appspot.com'
        })
        db = firestore.client()
        bucket = storage.bucket()
        HAS_FIREBASE = True
        print("Firebase Admin successfully initialized (Firestore + Cloud Storage).")
    else:
        print("firebase-key.json not found. Bypassing Firebase initialization.")
except Exception as e:
    print(f"Firebase initialization bypassed: {e}.")

app = Flask(__name__)

# Register localtileserver blueprint
app.register_blueprint(tileserver)

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
    download_url = "https://docs.google.com/uc?export=download"
    session = requests.Session()
    response = session.get(download_url, params={'id': file_id}, stream=True)
    
    if 'Google Drive - Virus scan warning' in response.text:
        import re
        html = response.text
        action_match = re.search(r'action="([^"]+)"', html)
        action_url = action_match.group(1) if action_match else "https://drive.usercontent.google.com/download"
        
        params = {}
        inputs = re.findall(r'<input type="hidden" name="([^"]+)" value="([^"]*)"', html)
        for name, value in inputs:
            params[name] = value
            
        response = session.get(action_url, params=params, stream=True)
        
    if response.status_code != 200:
        raise Exception(f"Google Drive download failed (Status {response.status_code})")
        
    with open(destination_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=1024*1024):
            if chunk:
                f.write(chunk)

# Helper to get raster bounds using pure rasterio (no client locks)
def get_raster_bounds(filepath):
    import rasterio
    from rasterio.warp import transform_bounds
    with rasterio.open(filepath) as src:
        bounds = transform_bounds(src.crs, 'EPSG:4326', *src.bounds)
        # transform_bounds returns (west, south, east, north)
        return [bounds[1], bounds[3], bounds[0], bounds[2]] # [minLat, maxLat, minLng, maxLng]

# Convert GeoTIFF to Cloud Optimized GeoTIFF (COG) using python rasterio
def convert_to_cog(input_path, output_path):
    import rasterio
    from rasterio.enums import Resampling
    
    print(f"Building pyramids for {input_path}...")
    with rasterio.open(input_path, 'r+') as src:
        factors = [2, 4, 8, 16, 32]
        src.build_overviews(factors, Resampling.nearest)
        src.update_tags(ns='rio_overview', resampling='nearest')
        
    print(f"Translating to COG...")
    with rasterio.open(input_path) as src:
        kwargs = src.meta.copy()
        kwargs.update({
            'driver': 'GTiff',
            'tiled': True,
            'blockxsize': 256,
            'blockysize': 256,
            'compress': 'deflate',
            'predictor': 2,
            'copy_src_overviews': True
        })
        with rasterio.open(output_path, 'w', **kwargs) as dst:
            for i in range(1, src.count + 1):
                dst.write(src.read(i), i)

# Asynchronous Background Processing Thread
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
        print(f"Async: Downloading {name}...")
        download_gdrive_file(file_id, temp_input)
        
        final_url = ""
        bounds = None
        
        if survey_type == 'raster':
            # 2. Convert to COG
            update_survey_status(survey_doc, 'converting')
            print(f"Async: Converting {name} to COG...")
            convert_to_cog(temp_input, temp_output)
            
            # 3. Read bounds using closed context
            bounds = get_raster_bounds(temp_output)
            
            # 4. Upload to Cloud
            if HAS_FIREBASE:
                update_survey_status(survey_doc, 'uploading')
                print(f"Async: Uploading {name} to Firebase Storage...")
                blob = bucket.blob(f"rasters/{survey_id}.tif")
                blob.upload_from_filename(temp_output)
                blob.make_public()
                final_url = f"https://titiler.xyz/cog/tiles/{{z}}/{{x}}/{{y}}.png?url={blob.public_url}"
            else:
                # Local fallback
                local_dest = os.path.join(UPLOAD_FOLDER, f"{survey_id}.tif")
                # Use copying instead of renaming to prevent file lock issues
                import shutil
                shutil.copy2(temp_output, local_dest)
                final_url = f"/api/tiles/{{z}}/{{x}}/{{y}}.png?filename={local_dest}"
        else:
            # Vector layer
            if HAS_FIREBASE:
                update_survey_status(survey_doc, 'uploading')
                print(f"Async: Uploading vector {name} to Firebase...")
                blob = bucket.blob(f"vectors/{survey_id}.kmz")
                blob.upload_from_filename(temp_input)
                blob.make_public()
                final_url = blob.public_url
            else:
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
        print(f"Async: Completed processing survey: {name}")
        
    except Exception as e:
        print(f"Async processing failed for {name}: {e}")
        # Clean up files
        try:
            if os.path.exists(temp_input): os.remove(temp_input)
            if os.path.exists(temp_output): os.remove(temp_output)
        except Exception:
            pass
        update_survey_status(survey_doc, 'failed', error_msg=str(e))

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
        
    if HAS_FIREBASE:
        try:
            db.collection('surveys').document(id).delete()
            try:
                bucket.blob(f"rasters/{id}.tif").delete()
            except Exception: pass
            try:
                bucket.blob(f"vectors/{id}.kmz").delete()
            except Exception: pass
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    else:
        local_db = load_local_db()
        updated_db = [s for s in local_db if s['id'] != id]
        save_local_db(updated_db)
        try:
            tif_path = os.path.join(UPLOAD_FOLDER, f"{id}.tif")
            if os.path.exists(tif_path): os.remove(tif_path)
            kmz_path = os.path.join(UPLOAD_FOLDER, f"{id}.kmz")
            if os.path.exists(kmz_path): os.remove(kmz_path)
        except Exception: pass
        return jsonify({'success': True})

@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_uploads(filename):
    from flask import send_from_directory
    return send_from_directory(UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    print(f"Starting DroneSurvey unified backend on port 8000...")
    app.run(host='0.0.0.0', port=8000)
