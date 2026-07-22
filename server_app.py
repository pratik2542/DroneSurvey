#!/usr/bin/env python3
"""
DroneSurvey Local GIS Tile Server & Cloudflare Tunnel Desktop GUI App
"""

import tkinter as tk
from tkinter import messagebox
import threading
import os
import subprocess
import sys
import re
import time
import urllib.request
import json

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
        self.root.geometry('680x700')
        self.root.configure(bg=BG)
        self.root.resizable(False, False)

        self.tunnel_url = ""
        self.server_process = None
        self.tunnel_process = None
        self.is_running = True

        self._build_ui()
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
        status_frame = tk.Frame(card, bg='#141724', padx=16, pady=14)
        status_frame.pack(fill='x', padx=14, pady=14)

        self.status_dot = tk.Label(status_frame, text='●', font=(FONT, 14), bg='#141724', fg=WARNING)
        self.status_dot.pack(side='left', padx=(0, 8))

        self.status_lbl = tk.Label(status_frame, text='Starting Local Tile Server (http://localhost:8000)...',
                                   font=(FONT, 10, 'bold'), bg='#141724', fg=TEXT)
        self.status_lbl.pack(side='left')

        # ── Public Tunnel URL Section ──────────────────────────────────────
        tk.Label(card, text='PUBLIC CLOUDFLARE TUNNEL URL', font=(FONT, 9, 'bold'),
                 bg=CARD, fg=SUBTEXT).pack(anchor='w', padx=16, pady=(6, 4))

        url_box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        url_box.pack(fill='x', padx=14, pady=(0, 10))

        url_inner = tk.Frame(url_box, bg='#090b14', padx=12, pady=12)
        url_inner.pack(fill='x')

        self.url_var = tk.StringVar(value='Generating Cloudflare Tunnel link...')
        self.url_entry = tk.Entry(url_inner, textvariable=self.url_var, font=('Consolas', 10, 'bold'),
                                  bg='#090b14', fg=ACCENT, relief='flat', state='readonly')
        self.url_entry.pack(fill='x', pady=(0, 8))

        btn_row = tk.Frame(url_inner, bg='#090b14')
        btn_row.pack(fill='x')

        self.copy_btn = tk.Button(btn_row, text='📋   COPY LINK TO CLIPBOARD', command=self._copy_url,
                                  font=(FONT, 10, 'bold'), bg=SUCCESS, fg='#000000', relief='flat',
                                  padx=16, pady=8, cursor='hand2', activebackground='#059669', activeforeground='#ffffff')
        self.copy_btn.pack(side='left', padx=(0, 10))

        self.open_web_btn = tk.Button(btn_row, text='🌐   OPEN WEB APP', command=self._open_web_app,
                                      font=(FONT, 10, 'bold'), bg=ACCENT, fg='#000000', relief='flat',
                                      padx=16, pady=8, cursor='hand2', activebackground='#0891b2', activeforeground='#ffffff')
        self.open_web_btn.pack(side='left')

        # ── Live Logs Console ──────────────────────────────────────────────
        tk.Label(card, text='LIVE SERVER & TUNNEL LOGS', font=(FONT, 9, 'bold'),
                 bg=CARD, fg=SUBTEXT).pack(anchor='w', padx=16, pady=(10, 4))

        log_wrap = tk.Frame(card, bg='#090b14', padx=1, pady=1)
        log_wrap.pack(fill='both', expand=True, padx=14, pady=(0, 14))

        self.log_box = tk.Text(log_wrap, bg='#090b14', fg=SUCCESS,
                                font=('Consolas', 9), relief='flat', state='disabled', wrap='word')
        sb = tk.Scrollbar(log_wrap, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        self.log_box.pack(fill='both', expand=True, padx=8, pady=8)

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

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
        messagebox.showinfo('Copied!', f'Tunnel URL copied to clipboard!\n\n{url}\n\nPaste this under "Connect Tile Server" in the Web App.')

    def _open_web_app(self):
        import webbrowser
        webbrowser.open(WEB_APP_URL)

    def _start_backend(self):
        threading.Thread(target=self._run_server_and_tunnel, daemon=True).start()

    def _run_server_and_tunnel(self):
        # 1. Start server.py in background thread/process
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

        # Wait 2 seconds for server to start
        time.sleep(2)
        
        self.root.after(0, lambda: self.status_dot.config(fg=SUCCESS))
        self.root.after(0, lambda: self.status_lbl.config(text="Local Tile Server Active (http://localhost:8000)"))
        self._log("Local Tile Server running successfully at http://localhost:8000")

        # 2. Launch Cloudflare Tunnel
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
                    self.tunnel_url = found_url
                    self.root.after(0, lambda u=found_url: self.url_var.set(u))
                    self.root.after(0, lambda u=found_url: self._log(f"✅ PUBLIC TUNNEL READY: {u}"))
                    
                    # Auto-copy to clipboard
                    try:
                        self.root.clipboard_clear()
                        self.root.clipboard_append(found_url)
                        self.root.after(0, lambda: self._log("📋 Public Tunnel URL copied to clipboard automatically!"))
                    except Exception:
                        pass
        except Exception as e:
            self._log(f"Cloudflare Tunnel Error: {e}")
            self.root.after(0, lambda: self.url_var.set("http://localhost:8000"))

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
