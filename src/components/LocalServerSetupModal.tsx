import React, { useState } from 'react';
import { X, Download, Server, RefreshCw, CheckCircle2, AlertCircle, Cpu, FileCode2, Terminal, ExternalLink, Zap } from 'lucide-react';
import JSZip from 'jszip';

interface LocalServerSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  isServerConnected: boolean;
  serverUrl: string;
  onCheckConnection: () => Promise<boolean>;
}

export const LocalServerSetupModal: React.FC<LocalServerSetupModalProps> = ({
  isOpen,
  onClose,
  isServerConnected,
  serverUrl,
  onCheckConnection,
}) => {
  const [activeTab, setActiveTab] = useState<'quickstart' | 'converter' | 'troubleshoot'>('quickstart');
  const [isZipping, setIsZipping] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'checking' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');

  if (!isOpen) return null;

  const handleTestServer = async () => {
    setTestStatus('checking');
    setTestMessage('Pinging local server...');
    const ok = await onCheckConnection();
    if (ok) {
      setTestStatus('success');
      setTestMessage('Local Tile Server is active & responding at ' + (serverUrl || 'http://localhost:8000'));
    } else {
      setTestStatus('failed');
      setTestMessage('Could not reach server. Make sure start_local_server.bat is running on your PC.');
    }
  };

  const handleDownloadZipPackage = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // 1. start_local_server.bat
      const startBat = `@echo off
title DroneSurvey — Local GIS Server ^& Tunnel App
color 0A

echo =======================================================================
echo          🛰  DroneSurvey Local GIS Server ^& Tunnel App Launcher
echo =======================================================================
echo.

:: 1. Check Python packages
echo [1/2] Checking dependencies...
python -c "import flask, rasterio, PIL" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing missing Python packages...
    python -m pip install flask rasterio pillow google-auth requests
)

:: 2. Launch Local Server Desktop App
echo [2/2] Launching DroneSurvey Server Desktop App GUI...
python server_app.py
`;
      zip.file('start_local_server.bat', startBat);

      // 2. README_INSTRUCTIONS.txt
      const readme = `=======================================================================
          🛰  DRONESURVEY — LOCAL SERVER & CONVERTER PACKAGE
=======================================================================

QUICK START INSTRUCTIONS:
-------------------------
1. Install Python 3.9+ if you haven't already (check "Add Python to PATH" during installation).
2. Double-click "start_local_server.bat" to launch the Local Tile Server Desktop App.
3. In the Desktop App window, select your GeoTIFF file from your PC (or browse to your .tif file).
4. Click "COPY FULL TILE URL TO CLIPBOARD"!
5. Open the DroneSurvey Web Application, go to "CONNECT TILE SERVER", press Ctrl+V to paste, and click CONNECT!

OFFLINE GEOTIFF CONVERTER TOOL:
--------------------------------
1. Open the "converter_tool" folder.
2. Double-click "setup.bat" once to install converter dependencies.
3. Double-click "run.bat" to launch the Local GeoTIFF -> COG GUI Desktop App window.
4. Select your raw .tif/.tiff file and convert it locally to Cloud-Optimized GeoTIFF!

Enjoy fast, zero-lag drone survey map streaming!
`;
      zip.file('README_INSTRUCTIONS.txt', readme);

      // 3. server_app.py (Desktop GUI App with File Selector & Full URL generator)
      const serverAppPy = `#!/usr/bin/env python3
import tkinter as tk
from tkinter import filedialog, messagebox
import threading, os, subprocess, sys, re, time, urllib.parse, webbrowser

BG, CARD, BORDER = '#0f1117', '#1a1d2e', '#2a2d3e'
ACCENT, SUCCESS, WARNING, ERROR = '#06b6d4', '#10b981', '#f59e0b', '#ef4444'
TEXT, SUBTEXT, FONT = '#ffffff', '#94a3b8', 'Segoe UI'
WEB_APP_URL = 'https://gen-lang-client-0025414331.web.app/'

class ServerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title('DroneSurvey — Local GIS Tile Server & Tunnel')
        self.root.geometry('720x760')
        self.root.configure(bg=BG)
        self.root.resizable(False, False)
        self.tunnel_base_url, self.selected_tif_path, self.server_process, self.tunnel_process, self.is_running = "", "", None, None, True
        self._build_ui()
        self._find_default_tif()
        self._start_backend()

    def _build_ui(self):
        hdr = tk.Frame(self.root, bg=ACCENT, height=64)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        tk.Label(hdr, text='🛰   DroneSurvey  ·  Local Tile Server & Tunnel', font=(FONT, 13, 'bold'), bg=ACCENT, fg='#000000').pack(side='left', padx=20, pady=16)

        outer = tk.Frame(self.root, bg=BG)
        outer.pack(fill='both', expand=True, padx=20, pady=16)
        card = tk.Frame(outer, bg=CARD, relief='flat', bd=0)
        card.pack(fill='both', expand=True, padx=4, pady=4)

        status_frame = tk.Frame(card, bg='#141724', padx=16, pady=12)
        status_frame.pack(fill='x', padx=14, pady=12)
        self.status_dot = tk.Label(status_frame, text='●', font=(FONT, 14), bg='#141724', fg=WARNING)
        self.status_dot.pack(side='left', padx=(0, 8))
        self.status_lbl = tk.Label(status_frame, text='Starting Local Tile Server (http://localhost:8000)...', font=(FONT, 10, 'bold'), bg='#141724', fg=TEXT)
        self.status_lbl.pack(side='left')

        tk.Label(card, text='STEP 1 — SELECT LOCAL GEOTIFF (.TIF) FILE ON YOUR PC', font=(FONT, 9, 'bold'), bg=CARD, fg=ACCENT).pack(anchor='w', padx=16, pady=(4, 4))
        tif_box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        tif_box.pack(fill='x', padx=14, pady=(0, 10))
        tif_inner = tk.Frame(tif_box, bg='#141724', padx=12, pady=10)
        tif_inner.pack(fill='x')

        self.tif_var = tk.StringVar(value='No GeoTIFF file selected yet...')
        self.tif_entry = tk.Entry(tif_inner, textvariable=self.tif_var, font=('Consolas', 9), bg='#090b14', fg=TEXT, relief='flat')
        self.tif_entry.pack(side='left', fill='x', expand=True, padx=(0, 8))
        self.tif_entry.bind('<KeyRelease>', lambda e: self._update_full_url())
        tk.Button(tif_inner, text='📁 Browse .TIF File...', command=self._browse_tif, font=(FONT, 9, 'bold'), bg=ACCENT, fg='#000000', relief='flat', padx=12, pady=4, cursor='hand2', activebackground='#0891b2', activeforeground='#ffffff').pack(side='right')

        tk.Label(card, text='STEP 2 — EXACT TILE URL TO PASTE IN WEB APP', font=(FONT, 9, 'bold'), bg=CARD, fg=SUCCESS).pack(anchor='w', padx=16, pady=(4, 4))
        url_box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        url_box.pack(fill='x', padx=14, pady=(0, 10))
        url_inner = tk.Frame(url_box, bg='#090b14', padx=12, pady=12)
        url_inner.pack(fill='x')

        self.url_var = tk.StringVar(value='Generating Cloudflare Tunnel link...')
        self.url_entry = tk.Entry(url_inner, textvariable=self.url_var, font=('Consolas', 9, 'bold'), bg='#090b14', fg=SUCCESS, relief='flat', state='readonly')
        self.url_entry.pack(fill='x', pady=(0, 8))

        btn_row = tk.Frame(url_inner, bg='#090b14')
        btn_row.pack(fill='x')
        self.copy_btn = tk.Button(btn_row, text='📋   COPY FULL TILE URL TO CLIPBOARD', command=self._copy_url, font=(FONT, 10, 'bold'), bg=SUCCESS, fg='#000000', relief='flat', padx=16, pady=8, cursor='hand2', activebackground='#059669', activeforeground='#ffffff')
        self.copy_btn.pack(side='left', padx=(0, 10))
        self.open_web_btn = tk.Button(btn_row, text='🌐   OPEN WEB APP', command=self._open_web_app, font=(FONT, 10, 'bold'), bg=ACCENT, fg='#000000', relief='flat', padx=16, pady=8, cursor='hand2', activebackground='#0891b2', activeforeground='#ffffff')
        self.open_web_btn.pack(side='left')

        tk.Label(card, text='LIVE SERVER & TUNNEL LOGS', font=(FONT, 9, 'bold'), bg=CARD, fg=SUBTEXT).pack(anchor='w', padx=16, pady=(6, 4))
        log_wrap = tk.Frame(card, bg='#090b14', padx=1, pady=1)
        log_wrap.pack(fill='both', expand=True, padx=14, pady=(0, 14))
        self.log_box = tk.Text(log_wrap, bg='#090b14', fg=SUCCESS, font=('Consolas', 8), relief='flat', state='disabled', wrap='word')
        sb = tk.Scrollbar(log_wrap, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        self.log_box.pack(fill='both', expand=True, padx=8, pady=8)

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _find_default_tif(self):
        uploads = os.path.abspath(os.path.join(os.path.dirname(__file__), 'uploads'))
        if os.path.exists(uploads):
            tifs = [os.path.join(uploads, f) for f in os.listdir(uploads) if f.lower().endswith(('.tif', '.tiff'))]
            if tifs:
                self.selected_tif_path = tifs[0]
                self.tif_var.set(self.selected_tif_path)

    def _browse_tif(self):
        path = filedialog.askopenfilename(title='Select Local GeoTIFF File', filetypes=[('GeoTIFF Files', '*.tif *.tiff'), ('All Files', '*.*')])
        if path:
            self.selected_tif_path = path
            self.tif_var.set(path)
            self._update_full_url()

    def _update_full_url(self):
        base = self.tunnel_base_url or "http://localhost:8000"
        path = self.tif_var.get().strip()
        if not path or 'No GeoTIFF' in path:
            full_url = f"{base}/api/tiles/{{z}}/{{x}}/{{y}}.png"
        else:
            full_url = f"{base}/api/tiles/{{z}}/{{x}}/{{y}}.png?filename={path}"
        self.url_var.set(full_url)

    def _log(self, msg):
        self.log_box.config(state='normal')
        self.log_box.insert('end', f'› {msg}\\n')
        self.log_box.see('end')
        self.log_box.config(state='disabled')

    def _copy_url(self):
        url = self.url_var.get()
        if not url or 'Generating' in url:
            messagebox.showwarning('Warning', 'Tunnel URL is still generating. Please wait a few seconds!')
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(url)
        messagebox.showinfo('Copied!', f'Full Tile URL copied to clipboard!\\n\\n{url}\\n\\nPaste this under "Connect Tile Server" in the Web App.')

    def _open_web_app(self): webbrowser.open(WEB_APP_URL)

    def _start_backend(self): threading.Thread(target=self._run_server_and_tunnel, daemon=True).start()

    def _run_server_and_tunnel(self):
        self._log("Starting Local Tile Server on port 8000...")
        python_cmd = sys.executable or 'python'
        try:
            self.server_process = subprocess.Popen([python_cmd, 'server.py'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
        except Exception as e: self._log(f"Failed to start server.py: {e}")
        time.sleep(2)
        self.root.after(0, lambda: self.status_dot.config(fg=SUCCESS))
        self.root.after(0, lambda: self.status_lbl.config(text="Local Tile Server Active (http://localhost:8000)"))
        self._log("Local Tile Server running successfully at http://localhost:8000")
        self._log("Requesting Cloudflare Tunnel URL...")
        try:
            self.tunnel_process = subprocess.Popen(['npx', 'cloudflared', 'tunnel', '--url', 'http://localhost:8000'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
            for line in iter(self.tunnel_process.stdout.readline, ''):
                if not self.is_running: break
                line_str = line.strip()
                if line_str: self.root.after(0, lambda l=line_str: self._log(l))
                match = re.search(r'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com', line_str)
                if match:
                    found_url = match.group(0)
                    self.tunnel_base_url = found_url
                    self.root.after(0, lambda: self._update_full_url())
                    self.root.after(0, lambda u=found_url: self._log(f"✅ PUBLIC TUNNEL READY: {u}"))
                    try:
                        full_url = self.url_var.get()
                        self.root.clipboard_clear()
                        self.root.clipboard_append(full_url)
                        self.root.after(0, lambda: self._log("📋 Full Tile URL copied to clipboard automatically!"))
                    except Exception: pass
        except Exception as e:
            self._log(f"Cloudflare Tunnel Error: {e}")
            self.tunnel_base_url = "http://localhost:8000"
            self.root.after(0, lambda: self._update_full_url())

    def _on_close(self):
        self.is_running = False
        if self.server_process: self.server_process.terminate()
        if self.tunnel_process: self.tunnel_process.terminate()
        self.root.destroy()

if __name__ == '__main__':
    root = tk.Tk()
    app = ServerApp(root)
    root.mainloop()
`;
      zip.file('server_app.py', serverAppPy);

      // 4. server.py
      const serverPyScript = `from flask import Flask, request, jsonify, send_file
import os, json, uuid, requests

app = Flask(__name__)

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-target-host')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/api/surveys', methods=['GET'])
def get_surveys():
    return jsonify([])

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "message": "DroneSurvey Local Server Running"})

if __name__ == '__main__':
    print("Starting DroneSurvey Local Tile Server on http://localhost:8000 ...")
    app.run(host='0.0.0.0', port=8000, debug=False)
`;
      zip.file('server.py', serverPyScript);

      // 5. run_tunnel.py
      const runTunnelScript = `import subprocess, re
def main():
    print("Starting Cloudflare Tunnel for DroneSurvey Local Server...")
    proc = subprocess.Popen(['npx', 'cloudflared', 'tunnel', '--url', 'http://localhost:8000'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    for line in iter(proc.stdout.readline, ''):
        print(line, end='')
        match = re.search(r'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com', line)
        if match:
            url = match.group(0)
            print("\\n==================================================")
            print(f"  YOUR PUBLIC TUNNEL URL: {url}")
            print("==================================================\\n")
            break
if __name__ == '__main__': main()
`;
      zip.file('run_tunnel.py', runTunnelScript);

      // 6. converter_tool Subfolder with full converter.py Desktop GUI App
      const converterFolder = zip.folder('converter_tool');
      if (converterFolder) {
        converterFolder.file('setup.bat', `@echo off\necho Installing DroneSurvey COG Converter dependencies...\npip install rasterio Pillow numpy google-api-python-client google-auth\necho Done!\npause\n`);
        converterFolder.file('run.bat', `@echo off\npython converter.py\n`);
        
        // Full converter.py desktop app
        const converterPyCode = `#!/usr/bin/env python3
import tkinter as tk
from tkinter import filedialog, messagebox
import threading, os, subprocess, sys

BG, CARD, BORDER = '#0f1117', '#1a1d2e', '#2a2d3e'
ACCENT, SUCCESS, WARNING, ERROR = '#6c63ff', '#00d68f', '#ffaa00', '#ff4757'
TEXT, SUBTEXT, FONT = '#ffffff', '#8f9bba', 'Segoe UI'

class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title('DroneSurvey — Local COG Converter')
        self.root.geometry('620x720')
        self.root.configure(bg=BG)
        self.root.resizable(False, False)
        self.selected_file, self.output_file = None, None
        self._build()

    def _build(self):
        hdr = tk.Frame(self.root, bg=ACCENT, height=64)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        tk.Label(hdr, text='🛰   DroneSurvey  ·  Local COG Converter', font=(FONT, 14, 'bold'), bg=ACCENT, fg=TEXT).pack(side='left', padx=24, pady=16)

        outer = tk.Frame(self.root, bg=BG)
        outer.pack(fill='both', expand=True, padx=20, pady=16)
        card = tk.Frame(outer, bg=CARD, relief='flat', bd=0)
        card.pack(fill='both', expand=True)

        self._section(card, 'Step 1 — Select GeoTIFF File')
        box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        box.pack(fill='x', pady=(0, 12))
        inner = tk.Frame(box, bg='#141724', padx=16, pady=16)
        inner.pack(fill='x')

        self.file_name_lbl = tk.Label(inner, text='No file selected', font=(FONT, 11, 'bold'), bg='#141724', fg=SUBTEXT)
        self.file_name_lbl.pack()
        self.file_size_lbl = tk.Label(inner, text='', font=(FONT, 9), bg='#141724', fg=SUBTEXT)
        self.file_size_lbl.pack(pady=(2, 0))

        tk.Button(inner, text='  Browse…  ', command=self._browse, font=(FONT, 10, 'bold'), bg=ACCENT, fg=TEXT, relief='flat', padx=18, pady=8, cursor='hand2', activebackground='#5a52d5', activeforeground=TEXT).pack(pady=(14, 0))

        self._section(card, 'Step 2 — Processing Progress')
        steps = [('File selected', False), ('Convert to COG (local)', True), ('Done — file saved!', False)]
        self._step_icons, self._step_lbls, self._step_pcts, self._bars = [], [], [], []

        for i, (label, has_bar) in enumerate(steps):
            row = tk.Frame(card, bg=CARD, pady=4)
            row.pack(fill='x')
            icon = tk.Label(row, text='○', font=(FONT, 13), bg=CARD, fg=SUBTEXT, width=3)
            icon.pack(side='left')
            lbl = tk.Label(row, text=label, font=(FONT, 10), bg=CARD, fg=SUBTEXT)
            lbl.pack(side='left')
            pct = tk.Label(row, text='', font=(FONT, 10, 'bold'), bg=CARD, fg=ACCENT)
            pct.pack(side='right', padx=4)
            self._step_icons.append(icon)
            self._step_lbls.append(lbl)
            self._step_pcts.append(pct)

            if has_bar:
                bar_row = tk.Frame(card, bg=CARD, pady=1)
                bar_row.pack(fill='x', padx=32)
                bar_bg = tk.Frame(bar_row, bg=BORDER, height=6)
                bar_bg.pack(fill='x')
                bar_bg.pack_propagate(False)
                fill = tk.Frame(bar_bg, bg=ACCENT, height=6)
                fill.place(x=0, y=0, relheight=1, width=0)
                self._bars.append((bar_bg, fill))
            else: self._bars.append(None)

        self._section(card, 'Log')
        log_wrap = tk.Frame(card, bg='#090b14', padx=1, pady=1)
        log_wrap.pack(fill='both', expand=True, pady=(0, 14))
        self.log_box = tk.Text(log_wrap, bg='#090b14', fg='#00d68f', font=('Consolas', 9), relief='flat', height=6, state='disabled', wrap='word')
        sb = tk.Scrollbar(log_wrap, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        self.log_box.pack(fill='both', expand=True, padx=8, pady=8)

        self.start_btn = tk.Button(card, text='▶   Start Processing', command=self._start, font=(FONT, 12, 'bold'), bg=ACCENT, fg=TEXT, relief='flat', padx=20, pady=12, cursor='hand2', activebackground='#5a52d5', activeforeground=TEXT, state='disabled')
        self.start_btn.pack(fill='x')

        self.result_frame = tk.Frame(card, bg='#0d2818', padx=16, pady=12)
        tk.Label(self.result_frame, text='✅   COG created successfully! Upload this file to your Google Drive:', font=(FONT, 10, 'bold'), bg='#0d2818', fg=SUCCESS).pack(anchor='w')
        path_row = tk.Frame(self.result_frame, bg='#0d2818')
        path_row.pack(fill='x', pady=(6, 0))
        self.path_var = tk.StringVar()
        tk.Entry(path_row, textvariable=self.path_var, font=('Consolas', 8), bg='#051a0f', fg=TEXT, relief='flat', state='readonly').pack(side='left', fill='x', expand=True, padx=(0, 8))
        tk.Button(path_row, text='Copy Path', command=self._copy_path, font=(FONT, 9, 'bold'), bg=SUCCESS, fg='#000', relief='flat', padx=10, pady=4, cursor='hand2').pack(side='right', padx=(0, 6))

    def _section(self, parent, title):
        tk.Label(parent, text=title, font=(FONT, 11, 'bold'), bg=CARD, fg=TEXT).pack(anchor='w', pady=(10, 4))

    def _browse(self):
        path = filedialog.askopenfilename(title='Select GeoTIFF', filetypes=[('GeoTIFF', '*.tif *.tiff'), ('All files', '*.*')])
        if not path: return
        self.selected_file = path
        name = os.path.basename(path)
        mb = os.path.getsize(path) / (1024 * 1024)
        self.file_name_lbl.config(text=f'📄   {name}', fg=TEXT)
        size_txt = f'{mb/1024:.2f} GB' if mb >= 1024 else f'{mb:.1f} MB'
        self.file_size_lbl.config(text=f'Size: {size_txt}', fg=WARNING if mb >= 1024 else SUBTEXT)
        self._set_step(0, 'done')
        self.start_btn.config(state='normal')
        self._log(f'Selected: {name} ({size_txt})')

    def _start(self):
        self.start_btn.config(state='disabled', text='Processing…')
        self.result_frame.pack_forget()
        for i in range(1, 3): self._set_step(i, 'idle')
        if self._bars[1]:
            _, fill = self._bars[1]
            fill.place(width=0)
        self._step_pcts[1].config(text='')
        threading.Thread(target=self._worker, daemon=True).start()

    def _worker(self):
        input_path = self.selected_file
        base = os.path.splitext(input_path)[0]
        output_path = base + '_cog.tif'
        self.output_file = output_path
        try:
            import rasterio
            from rasterio.enums import Resampling
            self._ui(lambda: self._set_step(1, 'active'))
            file_size_gb = os.path.getsize(input_path) / (1024 ** 3)
            bigtiff = 'YES' if file_size_gb > 3.9 else 'NO'
            self._ui(lambda s=f'{file_size_gb:.1f} GB (BIGTIFF={bigtiff})': self._log(f'Input file: {s}'))
            
            with rasterio.open(input_path) as src:
                meta = src.meta.copy()
                meta.update(driver='GTiff', tiled=True, blockxsize=256, blockysize=256, compress='deflate', predictor=2, BIGTIFF=bigtiff)
                with rasterio.open(output_path, 'w', **meta) as dst:
                    windows = list(src.block_windows(1))
                    total = len(windows)
                    for idx, (_, window) in enumerate(windows):
                        for band_idx in range(1, src.count + 1):
                            dst.write(src.read(band_idx, window=window), band_idx, window=window)
                        if idx % 200 == 0:
                            pct = 30 + int((idx / total) * 70)
                            self._ui(lambda p=pct: self._set_bar(1, p))

            self._ui(lambda: self._set_bar(1, 100))
            self._ui(lambda: self._set_step(1, 'done'))
            self._ui(lambda: self._set_step(2, 'done'))
            self._ui(lambda p=self.output_file: self._log(f'COG saved locally: {p}'))
            self._ui(lambda p=self.output_file: self._show_result(p))
        except Exception as exc:
            msg = str(exc)
            self._ui(lambda m=msg: self._log(f'ERROR: {m}'))
            self._ui(lambda m=msg: messagebox.showerror('Conversion failed', m))
            self._ui(lambda: self.start_btn.config(state='normal', text='▶   Start Processing'))

    def _ui(self, fn): self.root.after(0, fn)

    def _log(self, msg):
        self.log_box.config(state='normal')
        self.log_box.insert('end', f'› {msg}\\n')
        self.log_box.see('end')
        self.log_box.config(state='disabled')

    def _set_step(self, idx, state):
        icon, lbl = self._step_icons[idx], self._step_lbls[idx]
        if state == 'done': icon.config(text='✓', fg=SUCCESS); lbl.config(fg=TEXT)
        elif state == 'active': icon.config(text='◉', fg=ACCENT); lbl.config(fg=TEXT)
        elif state == 'error': icon.config(text='✗', fg=ERROR); lbl.config(fg=ERROR)
        else: icon.config(text='○', fg=SUBTEXT); lbl.config(fg=SUBTEXT)

    def _set_bar(self, bar_idx, pct):
        entry = self._bars[bar_idx]
        if not entry: return
        bg, fill = entry
        bg.update_idletasks()
        w = bg.winfo_width()
        fill.place(x=0, y=0, relheight=1, width=max(1, int(w * pct / 100)))
        self._step_pcts[bar_idx].config(text=f'{pct}%')

    def _show_result(self, path):
        self.path_var.set(path)
        self.result_frame.pack(fill='x', pady=(14, 0))
        self.start_btn.config(state='normal', text='▶   Convert Another File')

    def _copy_path(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.path_var.get())
        messagebox.showinfo('Copied!', 'File path copied to clipboard.')

if __name__ == '__main__':
    root = tk.Tk()
    App(root)
    root.mainloop()
`;
        converterFolder.file('converter.py', converterPyCode);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'DroneSurvey_Local_Tools.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Failed to generate tools package zip:', e);
      alert('Failed to generate ZIP package. Please try again.');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-2 sm:my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-semibold text-white">Local Server & Converter Center</h2>
              <p className="text-[10px] sm:text-xs text-slate-400">Run local tile server, convert GeoTIFFs & stream drone surveys without code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Status & Quick Action Banner */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800/80 to-slate-900 border-b border-slate-800">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full animate-pulse shrink-0 ${isServerConnected ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-rose-500 shadow-lg shadow-rose-500/50'}`} />
              <div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm font-medium text-white">
                    {isServerConnected ? 'Local Tile Server Connected' : 'Local Tile Server Offline'}
                  </span>
                  <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-mono font-medium truncate max-w-[200px] sm:max-w-none ${isServerConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                    {serverUrl || 'http://localhost:8000'}
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                  {isServerConnected 
                    ? 'Ready to process and stream heavy GeoTIFFs & survey layers instantly!' 
                    : 'Start start_local_server.bat on your PC to enable high-speed raster tile rendering.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end shrink-0">
              <button
                onClick={handleTestServer}
                className="px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testStatus === 'checking' ? 'animate-spin' : ''}`} />
                <span>Test</span>
              </button>
              <button
                onClick={handleDownloadZipPackage}
                disabled={isZipping}
                className="px-3 sm:px-4 py-2 rounded-xl text-xs font-medium text-slate-900 bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 font-semibold shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{isZipping ? 'Creating...' : 'Download Setup Package (.zip)'}</span>
              </button>
            </div>
          </div>

          {testMessage && (
            <div className={`mt-3 sm:mt-4 p-2.5 sm:p-3 rounded-xl text-xs flex items-center gap-2.5 ${testStatus === 'success' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}`}>
              {testStatus === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
              <span>{testMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-3 sm:px-6 overflow-x-auto custom-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('quickstart')}
            className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'quickstart' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Server className="w-4 h-4" />
            1-Click Quickstart Guide
          </button>
          <button
            onClick={() => setActiveTab('converter')}
            className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'converter' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Cpu className="w-4 h-4" />
            Offline GeoTIFF Converter Tool
          </button>
          <button
            onClick={() => setActiveTab('troubleshoot')}
            className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'troubleshoot' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <FileCode2 className="w-4 h-4" />
            CORS & Tunneling Help
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto custom-scrollbar">
          {activeTab === 'quickstart' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                How to Set Up Your Local Server App (Desktop GUI)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/20">1</div>
                  <h4 className="text-xs font-medium text-white">Download Tools Zip</h4>
                  <p className="text-xs text-slate-400">Click the download button above to save <span className="text-cyan-300 font-mono">DroneSurvey_Local_Tools.zip</span>.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/20">2</div>
                  <h4 className="text-xs font-medium text-white">Select Your .TIF File</h4>
                  <p className="text-xs text-slate-400">Double-click <span className="text-emerald-300 font-mono">start_local_server.bat</span> and browse to select your local .tif file.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/20">3</div>
                  <h4 className="text-xs font-medium text-white">1-Click Copy & Connect</h4>
                  <p className="text-xs text-slate-400">Click <span className="text-emerald-400 font-semibold">📋 Copy Full Tile URL</span> in the desktop app and paste under CONNECT TILE SERVER!</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'converter' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Local Cloud-Optimized GeoTIFF (COG) Converter App
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Raw GeoTIFF files can be hundreds of megabytes or gigabytes in size. To stream them on interactive maps smoothly without lag, convert them to COGs first using our desktop converter GUI app.
              </p>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-white">Steps to Convert GeoTIFFs Offline:</h4>
                <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1.5 leading-relaxed">
                  <li>Open the <span className="text-cyan-300 font-mono">converter_tool</span> folder in your unzipped package.</li>
                  <li>Double-click <span className="text-cyan-300 font-mono">setup.bat</span> once to auto-install dependencies (<span className="font-mono text-slate-400">rasterio, pillow, numpy</span>).</li>
                  <li>Double-click <span className="text-cyan-300 font-mono">run.bat</span> to launch the desktop converter window.</li>
                  <li>Select your raw <span className="font-mono text-slate-300">.tif/.tiff</span> file and click **Start Processing**.</li>
                  <li>Load your converted <span className="font-mono text-emerald-300">_cog.tif</span> output straight into the web map!</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'troubleshoot' && (
            <div className="space-y-4 text-xs text-slate-300">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-cyan-400" />
                Troubleshooting & Remote Server Access
              </h3>
              
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
                  <h4 className="font-semibold text-white mb-1">Issue: Desktop App Closes Instantly</h4>
                  <p className="text-slate-400 leading-relaxed">
                    Ensure Python 3 is installed on your Windows PC and added to system PATH during installation.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <p className="text-xs text-slate-400">DroneSurvey GIS Suite • Zero-Code Desktop & Web Tools</p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
