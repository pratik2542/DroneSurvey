#!/usr/bin/env python3
"""
DroneSurvey Local COG Converter
Select a raw .tif file → converts to Cloud Optimized GeoTIFF (COG) locally → saves file on your disk.
"""

import tkinter as tk
from tkinter import filedialog, messagebox
import threading
import os
import subprocess

# ── Theme ─────────────────────────────────────────────────────────────────────
BG      = '#0f1117'
CARD    = '#1a1d2e'
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
        self.root.title('DroneSurvey — Local COG Converter')
        self.root.geometry('620x720')
        self.root.configure(bg=BG)
        self.root.resizable(False, False)

        self.selected_file = None
        self.output_file   = None
        self._build()

    # ── UI Build ──────────────────────────────────────────────────────────────
    def _build(self):
        # Header bar
        hdr = tk.Frame(self.root, bg=ACCENT, height=64)
        hdr.pack(fill='x')
        hdr.pack_propagate(False)
        tk.Label(hdr, text='🛰   DroneSurvey  ·  Local COG Converter',
                 font=(FONT, 14, 'bold'), bg=ACCENT, fg=TEXT).pack(
                 side='left', padx=24, pady=16)

        outer = tk.Frame(self.root, bg=BG)
        outer.pack(fill='both', expand=True, padx=20, pady=16)

        card = tk.Frame(outer, bg=CARD, relief='flat', bd=0)
        card.pack(fill='both', expand=True)

        # ── Step 1: Select file ───────────────────────────────────────────
        self._section(card, 'Step 1 — Select GeoTIFF File')

        box = tk.Frame(card, bg=BORDER, padx=1, pady=1)
        box.pack(fill='x', pady=(0, 12))
        inner = tk.Frame(box, bg='#141724', padx=16, pady=16)
        inner.pack(fill='x')

        self.file_name_lbl = tk.Label(inner, text='No file selected',
                                      font=(FONT, 11, 'bold'), bg='#141724', fg=SUBTEXT)
        self.file_name_lbl.pack()
        self.file_size_lbl = tk.Label(inner, text='',
                                      font=(FONT, 9), bg='#141724', fg=SUBTEXT)
        self.file_size_lbl.pack(pady=(2, 0))

        tk.Button(inner, text='  Browse…  ', command=self._browse,
                  font=(FONT, 10, 'bold'), bg=ACCENT, fg=TEXT, relief='flat',
                  padx=18, pady=8, cursor='hand2',
                  activebackground='#5a52d5', activeforeground=TEXT).pack(pady=(14, 0))

        # ── Step 2: Progress steps ─────────────────────────────────────────
        self._section(card, 'Step 2 — Processing Progress')

        steps = [
            ('File selected',           False),
            ('Convert to COG (local)',   True),
            ('Done — file saved!',      False),
        ]
        self._step_icons = []
        self._step_lbls  = []
        self._step_pcts  = []
        self._bars       = []

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
            else:
                self._bars.append(None)

        # ── Log ────────────────────────────────────────────────────────────
        self._section(card, 'Log')

        log_wrap = tk.Frame(card, bg='#090b14', padx=1, pady=1)
        log_wrap.pack(fill='both', expand=True, pady=(0, 14))

        self.log_box = tk.Text(log_wrap, bg='#090b14', fg='#00d68f',
                                font=('Consolas', 9), relief='flat',
                                height=6, state='disabled', wrap='word')
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
                 text='✅   COG created successfully! Upload this file to your Google Drive:',
                 font=(FONT, 10, 'bold'), bg='#0d2818', fg=SUCCESS).pack(anchor='w')

        path_row = tk.Frame(self.result_frame, bg='#0d2818')
        path_row.pack(fill='x', pady=(6, 0))

        self.path_var = tk.StringVar()
        tk.Entry(path_row, textvariable=self.path_var,
                 font=('Consolas', 8), bg='#051a0f', fg=TEXT,
                 relief='flat', state='readonly').pack(side='left', fill='x', expand=True, padx=(0, 8))

        tk.Button(path_row, text='Copy Path', command=self._copy_path,
                  font=(FONT, 9, 'bold'), bg=SUCCESS, fg='#000',
                  relief='flat', padx=10, pady=4, cursor='hand2').pack(side='right', padx=(0, 6))

        tk.Button(path_row, text='Open Folder', command=self._open_folder,
                  font=(FONT, 9, 'bold'), bg='#00b894', fg='#000',
                  relief='flat', padx=10, pady=4, cursor='hand2').pack(side='right')

    def _section(self, parent, title):
        tk.Label(parent, text=title, font=(FONT, 11, 'bold'),
                 bg=CARD, fg=TEXT).pack(anchor='w', pady=(10, 4))

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
        self._log(f'Selected: {name} ({size_txt})')

    def _start(self):
        self.start_btn.config(state='disabled', text='Processing…')
        self.result_frame.pack_forget()

        for i in range(1, 3):
            self._set_step(i, 'idle')
        if self._bars[1]:
            _, fill = self._bars[1]
            fill.place(width=0)
        self._step_pcts[1].config(text='')

        threading.Thread(target=self._worker, daemon=True).start()

    def _worker(self):
        input_path  = self.selected_file
        base        = os.path.splitext(input_path)[0]
        output_path = base + '_cog.tif'
        self.output_file = output_path

        try:
            import rasterio
            from rasterio.enums import Resampling

            self._ui(lambda: self._set_step(1, 'active'))

            file_size_gb = os.path.getsize(input_path) / (1024 ** 3)
            bigtiff = 'YES' if file_size_gb > 3.9 else 'NO'
            self._ui(lambda s=f'{file_size_gb:.1f} GB  (BIGTIFF={bigtiff})': self._log(f'Input file: {s}'))

            # Check if file is already a _cog.tif file
            is_cog_filename = input_path.lower().endswith(('_cog.tif', '_cog.tiff'))

            with rasterio.open(input_path) as probe:
                has_overviews = len(probe.overviews(1)) > 0
                is_tiled      = probe.profile.get('tiled', False)
                already_cog   = is_cog_filename and has_overviews and is_tiled

            if already_cog:
                self._ui(lambda: self._log('Selected file is already a _cog.tif file ✓ — ready to upload!'))
                self._ui(lambda: self._set_bar(1, 100))
                self._ui(lambda: self._set_step(1, 'done'))
                self.output_file = input_path
            else:
                if has_overviews:
                    self._ui(lambda: self._log('Overviews exist — skipping pyramid build step.'))
                else:
                    self._ui(lambda: self._log('Building overviews (pyramids)…'))
                    with rasterio.open(input_path, 'r+') as src:
                        src.build_overviews([2, 4, 8, 16, 32, 64], Resampling.nearest)
                        src.update_tags(ns='rio_overview', resampling='nearest')
                    self._ui(lambda: self._log('Overviews complete.'))

                self._ui(lambda: self._set_bar(1, 30))
                self._ui(lambda: self._log('Writing COG tiles (block-windowed streaming)…'))

                with rasterio.open(input_path) as src:
                    meta = src.meta.copy()
                    meta.update(
                        driver='GTiff', tiled=True,
                        blockxsize=256, blockysize=256,
                        compress='deflate', predictor=2,
                        copy_src_overviews=True,
                        BIGTIFF=bigtiff,
                    )
                    with rasterio.open(output_path, 'w', **meta) as dst:
                        windows = list(src.block_windows(1))
                        total   = len(windows)
                        for idx, (_, window) in enumerate(windows):
                            for band_idx in range(1, src.count + 1):
                                dst.write(src.read(band_idx, window=window), band_idx, window=window)
                            if idx % 200 == 0:
                                pct = 30 + int((idx / total) * 70)
                                self._ui(lambda p=pct: self._set_bar(1, p))

                self._ui(lambda: self._set_bar(1, 100))
                self._ui(lambda: self._set_step(1, 'done'))

            cog_mb = os.path.getsize(self.output_file) / (1024 * 1024)
            size_txt = f'{cog_mb/1024:.2f} GB' if cog_mb >= 1024 else f'{cog_mb:.1f} MB'

            self._ui(lambda: self._set_step(2, 'done'))
            self._ui(lambda s=size_txt: self._log(f'COG saved locally!  Size: {s}'))
            self._ui(lambda p=self.output_file: self._log(f'Path: {p}'))
            self._ui(lambda p=self.output_file: self._show_result(p))

        except Exception as exc:
            msg = str(exc)
            self._ui(lambda m=msg: self._log(f'ERROR: {m}'))
            self._ui(lambda m=msg: messagebox.showerror('Conversion failed', m))
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
        entry = self._bars[bar_idx]
        if not entry:
            return
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

    def _open_folder(self):
        path = self.path_var.get()
        if os.path.exists(path):
            folder = os.path.dirname(path)
            subprocess.run(['explorer', '/select,', os.path.normpath(path)])


if __name__ == '__main__':
    root = tk.Tk()
    App(root)
    root.mainloop()
