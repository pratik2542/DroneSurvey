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
        self.root.geometry('720x760')
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
        hdr = tk.Frame(self.root, bg=ACCENT, height=64)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        
        tk.Label(hdr, text='🛰   DroneSurvey  ·  Local Tile Server & Tunnel',
                 font=(FONT, 13, 'bold'), bg=ACCENT, fg='#000000').pack(
                 side='left', padx=20, pady=16)

        outer = tk.Frame(self.root, bg=BG)
        outer.pack(fill='both', expand=True, padx=20, pady=16)

        card = tk.Frame(outer, bg=CARD, relief='flat', bd=0)
        card.pack(fill='both', expand=True, padx=4, pady=4)

        # ── Status Card ───────────────────────────────────────────────────
        status_frame = tk.Frame(card, bg='#141724', padx=16, pady=12)
        status_frame.pack(fill='x', padx=14, pady=12)

        self.status_dot = tk.Label(status_frame, text='●', font=(FONT, 14), bg='#141724', fg=WARNING)
        self.status_dot.pack(side='left', padx=(0, 8))

        self.status_lbl = tk.Label(status_frame, text='Starting Local Tile Server (http://localhost:8000)...',
                                   font=(FONT, 10, 'bold'), bg='#141724', fg=TEXT)
        self.status_lbl.pack(side='left')

        # ── Step 1: Select GeoTIFF File ──────────────────────────────────
        tk.Label(card, text='STEP 1 — SELECT LOCAL GEOTIFF (.TIF) FILE ON YOUR PC', font=(FONT, 9, 'bold'),
                 bg=CARD, fg=ACCENT).pack(anchor='w', padx=16, pady=(4, 4))

        tif_box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        tif_box.pack(fill='x', padx=14, pady=(0, 10))

        tif_inner = tk.Frame(tif_box, bg='#141724', padx=12, pady=10)
        tif_inner.pack(fill='x')

        self.tif_var = tk.StringVar(value='No GeoTIFF file selected yet...')
        self.tif_entry = tk.Entry(tif_inner, textvariable=self.tif_var, font=('Consolas', 9),
                                  bg='#090b14', fg=TEXT, relief='flat')
        self.tif_entry.pack(side='left', fill='x', expand=True, padx=(0, 8))
        self.tif_entry.bind('<KeyRelease>', lambda e: self._update_full_url())

        tk.Button(tif_inner, text='📁 Browse .TIF File...', command=self._browse_tif,
                  font=(FONT, 9, 'bold'), bg=ACCENT, fg='#000000', relief='flat',
                  padx=12, pady=4, cursor='hand2', activebackground='#0891b2', activeforeground='#ffffff').pack(side='right')

        # ── Step 2: Public Full Tile URL Section ─────────────────────────
        tk.Label(card, text='STEP 2 — EXACT TILE URL TO PASTE IN WEB APP', font=(FONT, 9, 'bold'),
                 bg=CARD, fg=SUCCESS).pack(anchor='w', padx=16, pady=(4, 4))

        url_box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        url_box.pack(fill='x', padx=14, pady=(0, 10))

        url_inner = tk.Frame(url_box, bg='#090b14', padx=12, pady=12)
        url_inner.pack(fill='x')

        self.url_var = tk.StringVar(value='Generating Cloudflare Tunnel link...')
        self.url_entry = tk.Entry(url_inner, textvariable=self.url_var, font=('Consolas', 9, 'bold'),
                                  bg='#090b14', fg=SUCCESS, relief='flat', state='readonly')
        self.url_entry.pack(fill='x', pady=(0, 8))

        btn_row = tk.Frame(url_inner, bg='#090b14')
        btn_row.pack(fill='x')

        self.copy_btn = tk.Button(btn_row, text='📋   COPY FULL TILE URL TO CLIPBOARD', command=self._copy_url,
                                  font=(FONT, 10, 'bold'), bg=SUCCESS, fg='#000000', relief='flat',
                                  padx=16, pady=8, cursor='hand2', activebackground='#059669', activeforeground='#ffffff')
        self.copy_btn.pack(side='left', padx=(0, 10))

        self.open_web_btn = tk.Button(btn_row, text='🌐   OPEN WEB APP', command=self._open_web_app,
                                      font=(FONT, 10, 'bold'), bg=ACCENT, fg='#000000', relief='flat',
                                      padx=16, pady=8, cursor='hand2', activebackground='#0891b2', activeforeground='#ffffff')
        self.open_web_btn.pack(side='left')

        # ── Live Logs Console ──────────────────────────────────────────────
        tk.Label(card, text='LIVE SERVER & TUNNEL LOGS', font=(FONT, 9, 'bold'),
                 bg=CARD, fg=SUBTEXT).pack(anchor='w', padx=16, pady=(6, 4))

        log_wrap = tk.Frame(card, bg='#090b14', padx=1, pady=1)
        log_wrap.pack(fill='both', expand=True, padx=14, pady=(0, 14))

        self.log_box = tk.Text(log_wrap, bg='#090b14', fg=SUCCESS,
                                font=('Consolas', 8), relief='flat', state='disabled', wrap='word')
        sb = tk.Scrollbar(log_wrap, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        self.log_box.pack(fill='both', expand=True, padx=8, pady=8)

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _find_default_tif(self):
        # Look for any .tif in uploads or current directory
        uploads = os.path.abspath(os.path.join(os.path.dirname(__file__), 'uploads'))
        if os.path.exists(uploads):
            tifs = [os.path.join(uploads, f) for f in os.listdir(uploads) if f.lower().endswith(('.tif', '.tiff'))]
            if tifs:
                self.selected_tif_path = tifs[0]
                self.tif_var.set(self.selected_tif_path)
                return

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
        base = self.tunnel_base_url or "http://localhost:8000"
        path = self.tif_var.get().strip()
        if not path or 'No GeoTIFF' in path:
            full_url = f"{base}/api/tiles/{{z}}/{{x}}/{{y}}.png"
        else:
            full_url = f"{base}/api/tiles/{{z}}/{{x}}/{{y}}.png?filename={path}"
        
        self.url_var.set(full_url)

    def _log(self, msg):
        self.log_box.config(state='normal')
        self.log_box.insert('end', f'› {msg}\n')
        self.log_box.see('end')
        self.log_box.config(state='disabled')

    def _copy_url(self):
        url = self.url_var.get()
        if not url or 'Generating' in url:
            messagebox.showwarning('Warning', 'Tunnel URL is still generating. Please wait a few seconds!')
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(url)
        messagebox.showinfo('Copied!', f'Full Tile URL copied to clipboard!\n\n{url}\n\nSimply open the Web App, go to CONNECT TILE SERVER, press Ctrl+V to paste, and click CONNECT!')

    def _open_web_app(self):
        webbrowser.open(WEB_APP_URL)

    def _start_backend(self):
        threading.Thread(target=self._run_server_and_tunnel, daemon=True).start()

    def _run_server_and_tunnel(self):
        self._log("Starting Local Tile Server on port 8000...")
        python_cmd = sys.executable or 'python'
        
        try:
            self.server_process = subprocess.Popen(
                [python_cmd, 'server.py'],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
        except Exception as e:
            self._log(f"Failed to start server.py: {e}")

        time.sleep(2)
        
        self.root.after(0, lambda: self.status_dot.config(fg=SUCCESS))
        self.root.after(0, lambda: self.status_lbl.config(text="Local Tile Server Active (http://localhost:8000)"))
        self._log("Local Tile Server running successfully at http://localhost:8000")

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
                    
                    # Auto-copy full URL to clipboard
                    try:
                        full_url = self.url_var.get()
                        self.root.clipboard_clear()
                        self.root.clipboard_append(full_url)
                        self.root.after(0, lambda: self._log("📋 Full Tile URL copied to clipboard automatically!"))
                    except Exception:
                        pass
        except Exception as e:
            self._log(f"Cloudflare Tunnel Error: {e}")
            self.tunnel_base_url = "http://localhost:8000"
            self.root.after(0, lambda: self._update_full_url())

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
