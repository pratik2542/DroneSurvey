#!/usr/bin/env python3
"""
DroneSurvey COG Converter & Uploader
Select a raw .tif → converts to Cloud Optimized GeoTIFF → uploads to Google Drive.
"""

import tkinter as tk
from tkinter import filedialog, messagebox
import threading
import os
import json

# ── Load config ───────────────────────────────────────────────────────────────
CONFIG_FILE  = os.path.join(os.path.dirname(__file__), 'config.json')
SA_KEY_FILE  = os.path.join(os.path.dirname(__file__), 'service_account.json')

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE) as f:
            return json.load(f)
    return {'drive_folder_id': '', 'sa_key_path': SA_KEY_FILE}

# ── Theme ─────────────────────────────────────────────────────────────────────
BG      = '#0f1117'
CARD    = '#1a1d2e'
CARD2   = '#1e2235'
BORDER  = '#2a2d3e'
ACCENT  = '#6c63ff'
SUCCESS = '#00d68f'
WARNING = '#ffaa00'
ERROR   = '#ff4757'
TEXT    = '#ffffff'
SUBTEXT = '#8f9bba'
FONT    = 'Segoe UI'

# ── App ───────────────────────────────────────────────────────────────────────
class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title('DroneSurvey — COG Converter & Uploader')
        self.root.geometry('620x780')
        self.root.configure(bg=BG)
        self.root.resizable(False, False)

        self.config        = load_config()
        self.selected_file = None
        self._build()

    # ── UI Build ──────────────────────────────────────────────────────────────
    def _build(self):
        # Header bar
        hdr = tk.Frame(self.root, bg=ACCENT, height=64)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        tk.Label(hdr, text='🛰   DroneSurvey  ·  COG Converter & Uploader',
                 font=(FONT, 14, 'bold'), bg=ACCENT, fg=TEXT).pack(
                 side='left', padx=24, pady=16)

        outer = tk.Frame(self.root, bg=BG)
        outer.pack(fill='both', expand=True, padx=20, pady=16)

        card = tk.Frame(outer, bg=CARD, padx=28, pady=24)
        card.pack(fill='both', expand=True)

        # ── File selector ──────────────────────────────────────────────────
        self._section(card, 'Step 1 — Select GeoTIFF File')

        drop = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        drop.pack(fill='x', pady=(0, 18))
        inner = tk.Frame(drop, bg=CARD2, padx=20, pady=24)
        inner.pack(fill='x')

        self.file_name_lbl = tk.Label(inner, text='📁   No file selected',
                                       font=(FONT, 11), bg=CARD2, fg=SUBTEXT)
        self.file_name_lbl.pack()
        self.file_size_lbl = tk.Label(inner, text='',
                                       font=(FONT, 10), bg=CARD2, fg=SUBTEXT)
        self.file_size_lbl.pack(pady=(2, 0))

        tk.Button(inner, text='  Browse…  ', command=self._browse,
                  font=(FONT, 10, 'bold'), bg=ACCENT, fg=TEXT, relief='flat',
                  padx=18, pady=8, cursor='hand2',
                  activebackground='#5a52d5', activeforeground=TEXT).pack(pady=(14, 0))

        # ── Progress steps ─────────────────────────────────────────────────
        self._section(card, 'Step 2 — Processing Progress')

        steps = [
            ('File selected',                False),
            ('Convert to COG (local)',        True),
            ('Upload to Google Drive',        True),
            ('Done — link ready',             False),
        ]
        self._step_icons = []
        self._step_lbls  = []
        self._step_pcts  = []
        self._bars       = []

        for i, (label, has_bar) in enumerate(steps):
            row = tk.Frame(card, bg=CARD, pady=3)
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
                bar_bg = tk.Frame(bar_row, bg=BORDER, height=5)
                bar_bg.pack(fill='x')
                bar_bg.pack_propagate(False)
                fill = tk.Frame(bar_bg, bg=ACCENT, height=5)
                fill.place(x=0, y=0, relheight=1, width=0)
                self._bars.append((bar_bg, fill))
            else:
                self._bars.append(None)

        # ── Log ────────────────────────────────────────────────────────────
        self._section(card, 'Log')

        log_wrap = tk.Frame(card, bg='#090b14', padx=1, pady=1)
        log_wrap.pack(fill='both', expand=True, pady=(0, 18))

        self.log_box = tk.Text(log_wrap, bg='#090b14', fg='#00d68f',
                                font=('Consolas', 9), relief='flat',
                                height=7, state='disabled', wrap='word')
        sb = tk.Scrollbar(log_wrap, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=sb.set)
        sb.pack(side='right', fill='y')
        self.log_box.pack(fill='both', expand=True, padx=8, pady=8)

        # ── Start button ───────────────────────────────────────────────────
        self.start_btn = tk.Button(card, text='▶   Start Processing',
                                   command=self._start,
                                   font=(FONT, 12, 'bold'), bg=ACCENT, fg=TEXT,
                                   relief='flat', padx=20, pady=12, cursor='hand2',
                                   activebackground='#5a52d5', activeforeground=TEXT,
                                   state='disabled')
        self.start_btn.pack(fill='x')

        # ── Result area (hidden) ───────────────────────────────────────────
        self.result_frame = tk.Frame(card, bg='#0d2818', padx=16, pady=12)
        tk.Label(self.result_frame,
                 text='✅   Upload complete! Paste this link in the Admin panel:',
                 font=(FONT, 10, 'bold'), bg='#0d2818', fg=SUCCESS).pack(anchor='w')
        link_row = tk.Frame(self.result_frame, bg='#0d2818')
        link_row.pack(fill='x', pady=(6, 0))
        self.link_var = tk.StringVar()
        tk.Entry(link_row, textvariable=self.link_var,
                 font=('Consolas', 9), bg='#051a0f', fg=TEXT,
                 relief='flat', state='readonly').pack(side='left', fill='x', expand=True, padx=(0, 8))
        tk.Button(link_row, text='Copy', command=self._copy_link,
                  font=(FONT, 9, 'bold'), bg=SUCCESS, fg='#000',
                  relief='flat', padx=10, pady=4, cursor='hand2').pack(side='right')

    def _section(self, parent, title):
        tk.Label(parent, text=title, font=(FONT, 11, 'bold'),
                 bg=CARD, fg=TEXT).pack(anchor='w', pady=(10, 6))

    # ── Actions ───────────────────────────────────────────────────────────────
    def _browse(self):
        path = filedialog.askopenfilename(
            title='Select GeoTIFF',
            filetypes=[('GeoTIFF', '*.tif *.tiff'), ('All files', '*.*')]
        )
        if not path:
            return
        self.selected_file = path
        name = os.path.basename(path)
        mb   = os.path.getsize(path) / (1024 * 1024)
        self.file_name_lbl.config(text=f'📄   {name}', fg=TEXT)
        size_txt = f'{mb/1024:.2f} GB' if mb >= 1024 else f'{mb:.1f} MB'
        self.file_size_lbl.config(text=f'Size: {size_txt}',
                                   fg=WARNING if mb >= 1024 else SUBTEXT)
        self._set_step(0, 'done')
        self.start_btn.config(state='normal')
        self._log(f'Selected: {name}  ({size_txt})')

    def _start(self):
        cfg = self.config
        if not cfg.get('drive_folder_id'):
            messagebox.showerror('Config missing',
                'Please open config.json and set your drive_folder_id.\n'
                'This is the ID of the Google Drive folder where files will be saved.')
            return
        sa = cfg.get('sa_key_path', SA_KEY_FILE)
        if not os.path.exists(sa):
            messagebox.showerror('Service account key missing',
                f'Copy your service_account.json file to:\n{SA_KEY_FILE}')
            return

        self.start_btn.config(state='disabled', text='Processing…')
        self.result_frame.pack_forget()

        for i in range(1, 4):
            self._set_step(i, 'idle')
        for b in self._bars:
            if b:
                _, fill = b
                fill.place(width=0)
        for p in self._step_pcts:
            p.config(text='')

        threading.Thread(target=self._worker, daemon=True).start()

    def _worker(self):
        input_path  = self.selected_file
        base        = os.path.splitext(input_path)[0]
        output_path = base + '_cog.tif'

        try:
            import rasterio
            from rasterio.enums import Resampling

            # ── Convert ───────────────────────────────────────────────────
            self._ui(lambda: self._set_step(1, 'active'))
            self._ui(lambda: self._log('Building overviews (this takes time for large files)…'))

            with rasterio.open(input_path, 'r+') as src:
                src.build_overviews([2, 4, 8, 16, 32, 64], Resampling.nearest)
                src.update_tags(ns='rio_overview', resampling='nearest')

            self._ui(lambda: self._set_bar(0, 40))
            self._ui(lambda: self._log('Overviews done. Writing COG tiles…'))

            with rasterio.open(input_path) as src:
                meta = src.meta.copy()
                meta.update(driver='GTiff', tiled=True, blockxsize=256,
                            blockysize=256, compress='deflate', predictor=2,
                            copy_src_overviews=True)
                n = src.count
                with rasterio.open(output_path, 'w', **meta) as dst:
                    for i in range(1, n + 1):
                        dst.write(src.read(i), i)
                        pct = 40 + int((i / n) * 58)
                        self._ui(lambda p=pct: self._set_bar(0, p))

            self._ui(lambda: self._set_bar(0, 100))
            self._ui(lambda: self._set_step(1, 'done'))
            cog_mb = os.path.getsize(output_path) / (1024 * 1024)
            self._ui(lambda s=f'{cog_mb:.1f} MB': self._log(f'COG ready: {s}'))

            # ── Upload ────────────────────────────────────────────────────
            self._ui(lambda: self._set_step(2, 'active'))
            self._ui(lambda: self._log('Uploading to Google Drive…'))

            from google.oauth2 import service_account
            from googleapiclient.discovery import build
            from googleapiclient.http import MediaFileUpload

            sa_path = self.config.get('sa_key_path', SA_KEY_FILE)
            creds   = service_account.Credentials.from_service_account_file(
                sa_path, scopes=['https://www.googleapis.com/auth/drive'])
            svc     = build('drive', 'v3', credentials=creds)

            folder_id = self.config['drive_folder_id']
            meta_body = {'name': os.path.basename(output_path), 'parents': [folder_id]}
            media     = MediaFileUpload(output_path, mimetype='image/tiff',
                                        resumable=True, chunksize=5 * 1024 * 1024)
            req  = svc.files().create(body=meta_body, media_body=media, fields='id')
            resp = None
            while resp is None:
                status, resp = req.next_chunk()
                if status:
                    p = int(status.progress() * 100)
                    self._ui(lambda pct=p: self._set_bar(1, pct))
                    self._ui(lambda pct=p: self._log(f'  Upload: {pct}%'))

            file_id = resp.get('id')

            # Make file publicly readable
            svc.permissions().create(
                fileId=file_id,
                body={'type': 'anyone', 'role': 'reader'}
            ).execute()

            link = f'https://drive.google.com/file/d/{file_id}/view?usp=drive_link'

            self._ui(lambda: self._set_bar(1, 100))
            self._ui(lambda: self._set_step(2, 'done'))
            self._ui(lambda: self._set_step(3, 'done'))
            self._ui(lambda lnk=link: self._log(f'Done!  {lnk}'))
            self._ui(lambda lnk=link: self._show_result(lnk))

            try:
                os.remove(output_path)
            except Exception:
                pass

        except Exception as exc:
            msg = str(exc)
            self._ui(lambda m=msg: self._log(f'ERROR: {m}'))
            self._ui(lambda m=msg: messagebox.showerror('Processing failed', m))
            self._ui(lambda: self.start_btn.config(
                state='normal', text='▶   Start Processing'))

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _ui(self, fn):
        self.root.after(0, fn)

    def _log(self, msg):
        self.log_box.config(state='normal')
        self.log_box.insert('end', f'› {msg}\n')
        self.log_box.see('end')
        self.log_box.config(state='disabled')

    def _set_step(self, idx, state):
        icon, lbl = self._step_icons[idx], self._step_lbls[idx]
        if   state == 'done':   icon.config(text='✓', fg=SUCCESS); lbl.config(fg=TEXT)
        elif state == 'active': icon.config(text='◉', fg=ACCENT);  lbl.config(fg=TEXT)
        elif state == 'error':  icon.config(text='✗', fg=ERROR);   lbl.config(fg=ERROR)
        else:                   icon.config(text='○', fg=SUBTEXT);  lbl.config(fg=SUBTEXT)

    def _set_bar(self, bar_idx, pct):
        entry = self._bars[bar_idx + 1]
        if not entry:
            return
        bg, fill = entry
        bg.update_idletasks()
        w = bg.winfo_width()
        fill.place(x=0, y=0, relheight=1, width=max(1, int(w * pct / 100)))
        self._step_pcts[bar_idx + 1].config(text=f'{pct}%')

    def _show_result(self, link):
        self.link_var.set(link)
        self.result_frame.pack(fill='x', pady=(14, 0))
        self.start_btn.config(state='normal', text='▶   Process Another File')

    def _copy_link(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.link_var.get())
        messagebox.showinfo('Copied!', 'Link copied to clipboard.')


if __name__ == '__main__':
    root = tk.Tk()
    App(root)
    root.mainloop()
