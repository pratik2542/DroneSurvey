#!/usr/bin/env python3
"""
DroneSurvey Local GIS Tile Server & Cloudflare Tunnel Desktop GUI App
"""

import tkinter as tk
from tkinter import filedialog, messagebox
import threading
import os
import subprocess
import sys
import re
import time
import urllib.parse
import webbrowser

# ── Theme ─────────────────────────────────────────────────────────────────────
BG      = '#0f1117'
CARD    = '#1a1d2e'
BORDER  = '#2a2d3e'
ACCENT  = '#06b6d4' # Cyan
SUCCESS = '#10b981' # Emerald green
WARNING = '#f59e0b'
ERROR   = '#ef4444'
TEXT    = '#ffffff'
SUBTEXT = '#94a3b8'
FONT    = 'Segoe UI'

WEB_APP_URL = 'https://gen-lang-client-0025414331.web.app/'

class ServerApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title('DroneSurvey — Local GIS Tile Server & Tunnel')
        self.root.geometry('740x800')
        self.root.configure(bg=BG)
        self.root.resizable(False, False)

        self.tunnel_base_url = ""
        self.selected_tif_path = ""
        self.server_process = None
        self.tunnel_process = None
        self.is_running = True

        self._build_ui()
        self._find_default_tif()
        self._start_backend()

    def _build_ui(self):
        # Header bar
        hdr = tk.Frame(self.root, bg=ACCENT, height=60)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        
        tk.Label(hdr, text='🛰   DroneSurvey  ·  Local Tile Server & Tunnel',
                 font=(FONT, 13, 'bold'), bg=ACCENT, fg='#000000').pack(
                 side='left', padx=20, pady=16)

        outer = tk.Frame(self.root, bg=BG)
        outer.pack(fill='both', expand=True, padx=16, pady=12)

        card = tk.Frame(outer, bg=CARD, relief='flat', bd=0)
        card.pack(fill='both', expand=True, padx=4, pady=4)

        # ── Status Card ───────────────────────────────────────────────────
        status_frame = tk.Frame(card, bg='#141724', padx=14, pady=10)
        status_frame.pack(fill='x', padx=14, pady=10)

        self.status_dot = tk.Label(status_frame, text='●', font=(FONT, 12), bg='#141724', fg=WARNING)
        self.status_dot.pack(side='left', padx=(0, 6))

        self.status_lbl = tk.Label(status_frame, text='Starting Local Tile Server (http://localhost:8000)...',
                                   font=(FONT, 9, 'bold'), bg='#141724', fg=TEXT)
        self.status_lbl.pack(side='left')

        # ── Step 1: Select GeoTIFF File ──────────────────────────────────
        tk.Label(card, text='STEP 1 — SELECT LOCAL GEOTIFF (.TIF) FILE ON YOUR PC', font=(FONT, 9, 'bold'),
                 bg=CARD, fg=ACCENT).pack(anchor='w', padx=14, pady=(2, 2))

        tif_box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        tif_box.pack(fill='x', padx=14, pady=(0, 8))

        tif_inner = tk.Frame(tif_box, bg='#141724', padx=10, pady=8)
        tif_inner.pack(fill='x')

        self.tif_var = tk.StringVar(value='No GeoTIFF file selected yet...')
        self.tif_entry = tk.Entry(tif_inner, textvariable=self.tif_var, font=('Consolas', 9),
                                  bg='#090b14', fg=TEXT, relief='flat')
        self.tif_entry.pack(side='left', fill='x', expand=True, padx=(0, 8))
        self.tif_entry.bind('<KeyRelease>', lambda e: self._update_full_url())

        tk.Button(tif_inner, text='📁 Browse .TIF File...', command=self._browse_tif,
                  font=(FONT, 9, 'bold'), bg=ACCENT, fg='#000000', relief='flat',
                  padx=10, pady=4, cursor='hand2', activebackground='#0891b2', activeforeground='#ffffff').pack(side='right')

        # ── Step 2: Local & Public URL Section ───────────────────────────
        tk.Label(card, text='STEP 2 — COPY TILE URL & PASTE IN WEB APP', font=(FONT, 9, 'bold'),
                 bg=CARD, fg=SUCCESS).pack(anchor='w', padx=14, pady=(2, 2))

        url_box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        url_box.pack(fill='x', padx=14, pady=(0, 8))

        url_inner = tk.Frame(url_box, bg='#090b14', padx=12, pady=10)
        url_inner.pack(fill='x')

        # Public Tunnel URL Row (Primary for Live Web App over HTTPS)
        tk.Label(url_inner, text='🌐 PUBLIC TUNNEL URL (For Live Web App - HTTPS Compatible):', font=(FONT, 8, 'bold'), bg='#090b14', fg=SUCCESS).pack(anchor='w')
        tunnel_row = tk.Frame(url_inner, bg='#090b14')
        tunnel_row.pack(fill='x', pady=(2, 8))

        self.tunnel_url_var = tk.StringVar(value='Generating Cloudflare Tunnel link...')
        tk.Entry(tunnel_row, textvariable=self.tunnel_url_var, font=('Consolas', 8, 'bold'), bg='#141724', fg=SUCCESS, relief='flat', state='readonly').pack(side='left', fill='x', expand=True, padx=(0, 8))
        tk.Button(tunnel_row, text='📋 Copy Public URL', command=self._copy_tunnel_url, font=(FONT, 8, 'bold'), bg=SUCCESS, fg='#000000', relief='flat', padx=10, pady=3, cursor='hand2').pack(side='right')

        # Local URL Row (Secondary for Local HTTP testing)
        tk.Label(url_inner, text='⚡ LOCAL URL (For local http://localhost dev testing):', font=(FONT, 8, 'bold'), bg='#090b14', fg=ACCENT).pack(anchor='w')
        local_row = tk.Frame(url_inner, bg='#090b14')
        local_row.pack(fill='x', pady=(2, 6))

        self.local_url_var = tk.StringVar(value='http://localhost:8000/api/tiles/{z}/{x}/{y}.png')
        tk.Entry(local_row, textvariable=self.local_url_var, font=('Consolas', 8, 'bold'), bg='#141724', fg=ACCENT, relief='flat', state='readonly').pack(side='left', fill='x', expand=True, padx=(0, 8))
        tk.Button(local_row, text='📋 Copy Local URL', command=self._copy_local_url, font=(FONT, 8, 'bold'), bg=ACCENT, fg='#000000', relief='flat', padx=10, pady=3, cursor='hand2').pack(side='right')

        btn_row = tk.Frame(card, bg=CARD)
        btn_row.pack(fill='x', padx=14, pady=(0, 8))

        self.open_web_btn = tk.Button(btn_row, text='🌐   OPEN WEB APP (https://gen-lang-client-0025414331.web.app)', command=self._open_web_app,
                                      font=(FONT, 10, 'bold'), bg=SUCCESS, fg='#000000', relief='flat',
                                      padx=16, pady=8, cursor='hand2', activebackground='#059669', activeforeground='#ffffff')
        self.open_web_btn.pack(fill='x')

        # ── Live Logs Console ──────────────────────────────────────────────
        tk.Label(card, text='LIVE SERVER & TUNNEL LOGS', font=(FONT, 8, 'bold'),
                 bg=CARD, fg=SUBTEXT).pack(anchor='w', padx=14, pady=(2, 2))

        log_wrap = tk.Frame(card, bg='#090b14', padx=1, pady=1)
        log_wrap.pack(fill='both', expand=True, padx=14, pady=(0, 10))

        self.log_box = tk.Text(log_wrap, bg='#090b14', fg=SUCCESS,
                                font=('Consolas', 8), relief='flat', state='disabled', wrap='word')
        sb = tk.Scrollbar(log_wrap, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        self.log_box.pack(fill='both', expand=True, padx=6, pady=6)

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _find_default_tif(self):
        uploads = os.path.abspath(os.path.join(os.path.dirname(__file__), 'uploads'))
        if os.path.exists(uploads):
            tifs = [os.path.join(uploads, f) for f in os.listdir(uploads) if f.lower().endswith(('.tif', '.tiff'))]
            if tifs:
                self.selected_tif_path = tifs[0]
                self.tif_var.set(self.selected_tif_path)
                self._update_full_url()

    def _browse_tif(self):
        path = filedialog.askopenfilename(
            title='Select Local GeoTIFF File',
            filetypes=[('GeoTIFF Files', '*.tif *.tiff'), ('All Files', '*.*')]
        )
        if path:
            self.selected_tif_path = path
            self.tif_var.set(path)
            self._update_full_url()

    def _update_full_url(self):
        path = self.tif_var.get().strip()
        query = f"?filename={path}" if (path and 'No GeoTIFF' not in path) else ""

        # Local URL
        local_full = f"http://localhost:8000/api/tiles/{{z}}/{{x}}/{{y}}.png{query}"
        self.local_url_var.set(local_full)

        # Tunnel URL
        if self.tunnel_base_url:
            tunnel_full = f"{self.tunnel_base_url}/api/tiles/{{z}}/{{x}}/{{y}}.png{query}"
            self.tunnel_url_var.set(tunnel_full)

    def _log(self, msg):
        self.log_box.config(state='normal')
        self.log_box.insert('end', f'› {msg}\n')
        self.log_box.see('end')
        self.log_box.config(state='disabled')

    def _copy_local_url(self):
        url = self.local_url_var.get()
        self.root.clipboard_clear()
        self.root.clipboard_append(url)
        messagebox.showinfo('Copied Local URL!', f'Local Tile URL copied to clipboard!\n\n{url}\n\nNote: For HTTP local dev testing only.')

    def _copy_tunnel_url(self):
        url = self.tunnel_url_var.get()
        if not url or 'Generating' in url:
            messagebox.showwarning('Warning', 'Tunnel URL is still generating. Please wait a few seconds!')
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(url)
        messagebox.showinfo('Copied Public Tunnel URL!', f'Public Tunnel URL copied to clipboard!\n\n{url}\n\nPaste under CONNECT TILE SERVER in the web app!')

    def _open_web_app(self):
        webbrowser.open(WEB_APP_URL)

    def _start_backend(self):
        threading.Thread(target=self._run_server_and_tunnel, daemon=True).start()

    def _run_server_and_tunnel(self):
        self._log("Checking Python dependencies (flask, rasterio, Pillow, numpy)...")
        python_cmd = sys.executable or 'python'
        
        # Verify rasterio & flask import
        try:
            check_code = "import flask, rasterio, PIL, numpy; print('DEPS_OK')"
            res = subprocess.run([python_cmd, '-c', check_code], capture_output=True, text=True)
            if 'DEPS_OK' not in res.stdout:
                self._log("Installing required Python GIS libraries (rasterio, Pillow, numpy, flask)...")
                subprocess.run([python_cmd, '-m', 'pip', 'install', 'flask', 'rasterio', 'Pillow', 'numpy'], capture_output=True)
                self._log("Dependencies installed successfully!")
        except Exception as dep_err:
            self._log(f"Dependency warning: {dep_err}")

        self._log("Starting Local Tile Server on port 8000...")
        try:
            self.server_process = subprocess.Popen(
                [python_cmd, 'server.py'],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace'
            )

            # Monitor server.py output in background thread
            def monitor_server():
                for line in iter(self.server_process.stdout.readline, ''):
                    if not self.is_running:
                        break
                    l = line.strip()
                    if l:
                        self.root.after(0, lambda log_line=l: self._log(f"[Server] {log_line}"))

            threading.Thread(target=monitor_server, daemon=True).start()

        except Exception as e:
            self._log(f"Failed to start server.py: {e}")

        # Wait for server to respond on /health
        server_ready = False
        for _ in range(10):
            try:
                import urllib.request
                req = urllib.request.urlopen('http://localhost:8000/health', timeout=1)
                if req.status == 200:
                    server_ready = True
                    break
            except Exception:
                time.sleep(0.5)

        if server_ready:
            self.root.after(0, lambda: self.status_dot.config(fg=SUCCESS))
            self.root.after(0, lambda: self.status_lbl.config(text="Local Tile Server Active (http://localhost:8000)"))
            self._log("Local Tile Server running successfully at http://localhost:8000")
        else:
            self.root.after(0, lambda: self.status_dot.config(fg=WARNING))
            self.root.after(0, lambda: self.status_lbl.config(text="Local Tile Server starting..."))
            self._log("Local Tile Server initializing...")

        self._log("Requesting Cloudflare Tunnel URL...")
        try:
            self.tunnel_process = subprocess.Popen(
                ['npx', 'cloudflared', 'tunnel', '--url', 'http://localhost:8000'],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            
            for line in iter(self.tunnel_process.stdout.readline, ''):
                if not self.is_running:
                    break
                line_str = line.strip()
                if line_str:
                    self.root.after(0, lambda l=line_str: self._log(l))
                
                match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line_str)
                if match:
                    found_url = match.group(0)
                    self.tunnel_base_url = found_url
                    self.root.after(0, lambda: self._update_full_url())
                    self.root.after(0, lambda u=found_url: self._log(f"✅ PUBLIC TUNNEL READY: {u}"))
                    
                    # Auto-copy Public Tunnel URL to clipboard
                    try:
                        full_url = self.tunnel_url_var.get()
                        self.root.clipboard_clear()
                        self.root.clipboard_append(full_url)
                        self.root.after(0, lambda: self._log("📋 Public Tile URL copied to clipboard automatically!"))
                    except Exception:
                        pass
        except Exception as e:
            self._log(f"Cloudflare Tunnel Error: {e}")

    def _on_close(self):
        self.is_running = False
        if self.server_process:
            self.server_process.terminate()
        if self.tunnel_process:
            self.tunnel_process.terminate()
        self.root.destroy()

if __name__ == '__main__':
    root = tk.Tk()
    app = ServerApp(root)
    root.mainloop()
