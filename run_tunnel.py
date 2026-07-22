import subprocess
import re
import sys
import time

def main():
    print("=======================================================================")
    print("         DroneSurvey Local GIS Server & Tunnel Launcher")
    print("=======================================================================")
    print("\n[1/2] Starting cloudflared tunnel...")

    # Launch cloudflared process
    proc = subprocess.Popen(
        ['npx', 'cloudflared', 'tunnel', '--url', 'http://localhost:8000'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding='utf-8',
        errors='replace'
    )

    tunnel_url = None
    # Parse output to find trycloudflare URL
    for line in iter(proc.stdout.readline, ''):
        print(line, end='')
        match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
        if match:
            tunnel_url = match.group(0)
            break

    if tunnel_url:
        tif_path = r'C:\Users\PratiksinhMakwana\Downloads\Aryabhai\05FINAL_DATA\01KESHAV\20260528_EDF_KESHAV_UTM_42N_R2_ORTHOMOSAIC-004_cog.tif'
        full_tile_url = f"{tunnel_url}/api/tiles/{{z}}/{{x}}/{{y}}.png?filename={tif_path}"

        # Copy to Windows Clipboard automatically
        try:
            cmd = f'echo {full_tile_url}| clip'
            subprocess.run(cmd, shell=True)
            copied = " (COPIED TO CLIPBOARD!)"
        except Exception:
            copied = ""

        print("\n" + "="*75)
        print("  YOUR EXACT TILE URL TO PASTE IN WEB APP" + copied)
        print("="*75)
        print(f"\n{full_tile_url}\n")
        print("="*75)
        print("Simply open https://gen-lang-client-0025414331.web.app")
        print("Go to CONNECT TILE SERVER, press Ctrl+V to paste, and click CONNECT!")
        print("="*75 + "\n")

    # Keep output running
    for line in iter(proc.stdout.readline, ''):
        print(line, end='')

if __name__ == '__main__':
    main()
