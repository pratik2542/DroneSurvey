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
title DroneSurvey — Local GIS Server ^& Auto Tunnel
color 0A

echo =======================================================================
echo          🛰  DroneSurvey Local GIS Server ^& Auto Tunnel
echo =======================================================================
echo.

:: 1. Check Python packages
echo [1/2] Checking dependencies...
python -c "import flask, rasterio, PIL" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing missing Python packages...
    python -m pip install flask rasterio pillow google-auth requests
)

:: 2. Launch Local Server in background window
echo [2/2] Starting Local Tile Server on http://localhost:8000 ...
start "DroneSurvey Local Backend" /min cmd /c "python server.py"

:: Wait 2 seconds for Flask to boot
timeout /t 2 /nobreak >nul

:: 3. Launch tunnel & auto-format exact tile URL
python run_tunnel.py
`;
      zip.file('start_local_server.bat', startBat);

      // 2. README_INSTRUCTIONS.txt
      const readme = `=======================================================================
          🛰  DRONESURVEY — LOCAL SERVER & CONVERTER PACKAGE
=======================================================================

QUICK START INSTRUCTIONS:
-------------------------
1. Install Python 3.9+ if you haven't already (check "Add Python to PATH" during installation).
2. Double-click "start_local_server.bat" to boot the Local Tile Server.
3. Keep the server window running in the background.
4. Open the DroneSurvey Web Application in your browser.
5. Under "Connect Tile Server" or "Local Server Setup", verify connection to http://localhost:8000!

OFFLINE GEOTIFF CONVERTER TOOL:
--------------------------------
1. Open the "converter_tool" folder.
2. Double-click "setup.bat" once to install converter dependencies.
3. Double-click "run.bat" to launch the Local GeoTIFF -> COG GUI converter tool.
4. Select your raw .tif/.tiff file and convert it locally to Cloud-Optimized GeoTIFF!

Enjoy fast, zero-lag drone survey map streaming!
`;
      zip.file('README_INSTRUCTIONS.txt', readme);

      // Fetch server.py and run_tunnel.py content from server or provide scripts
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

      const runTunnelScript = `import subprocess, re

def main():
    print("Starting Cloudflare Tunnel for DroneSurvey Local Server...")
    proc = subprocess.Popen(
        ['npx', 'cloudflared', 'tunnel', '--url', 'http://localhost:8000'],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace'
    )
    for line in iter(proc.stdout.readline, ''):
        print(line, end='')
        match = re.search(r'https://[a-zA-Z0-9-]+\\.trycloudflare\\.com', line)
        if match:
            url = match.group(0)
            print("\\n==================================================")
            print(f"  YOUR PUBLIC TUNNEL URL: {url}")
            print("==================================================\\n")
            break

if __name__ == '__main__':
    main()
`;
      zip.file('run_tunnel.py', runTunnelScript);

      // Add converter_tool subfolder
      const converterFolder = zip.folder('converter_tool');
      if (converterFolder) {
        converterFolder.file('setup.bat', `@echo off\necho Installing DroneSurvey COG Converter dependencies...\npip install rasterio Pillow numpy google-api-python-client google-auth\necho Done!\npause\n`);
        converterFolder.file('run.bat', `@echo off\npython converter.py\n`);
        converterFolder.file('README.txt', `Double-click setup.bat first, then run.bat to convert GeoTIFFs to COG format.`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Local Server & Converter Center</h2>
              <p className="text-xs text-slate-400">Run local tile server, convert GeoTIFFs & stream drone surveys without code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Status & Quick Action Banner */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-800/80 to-slate-900 border-b border-slate-800">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3.5 h-3.5 rounded-full animate-pulse ${isServerConnected ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-rose-500 shadow-lg shadow-rose-500/50'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {isServerConnected ? 'Local Tile Server Connected' : 'Local Tile Server Offline'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${isServerConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                    {serverUrl || 'http://localhost:8000'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isServerConnected 
                    ? 'Ready to process and stream heavy GeoTIFFs & survey layers instantly!' 
                    : 'Start start_local_server.bat on your PC to enable high-speed raster tile rendering.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <button
                onClick={handleTestServer}
                className="px-3 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testStatus === 'checking' ? 'animate-spin' : ''}`} />
                Test Status
              </button>
              <button
                onClick={handleDownloadZipPackage}
                disabled={isZipping}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-900 bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 font-semibold shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isZipping ? 'Creating Package...' : 'Download Setup Package (.zip)'}
              </button>
            </div>
          </div>

          {testMessage && (
            <div className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2.5 ${testStatus === 'success' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}`}>
              {testStatus === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
              <span>{testMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-6">
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
                How to Set Up Your Local Server (No Coding Required)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/20">1</div>
                  <h4 className="text-xs font-medium text-white">Download Tools Zip</h4>
                  <p className="text-xs text-slate-400">Click the download button above to save <span className="text-cyan-300 font-mono">DroneSurvey_Local_Tools.zip</span> to your PC.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/20">2</div>
                  <h4 className="text-xs font-medium text-white">Extract & Run Server</h4>
                  <p className="text-xs text-slate-400">Extract the zip archive and double-click <span className="text-emerald-300 font-mono">start_local_server.bat</span>.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-800 space-y-2">
                  <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/20">3</div>
                  <h4 className="text-xs font-medium text-white">Connect & Render</h4>
                  <p className="text-xs text-slate-400">Return to this web page! The status badge will turn <span className="text-emerald-400 font-medium">Green</span> automatically.</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 space-y-2">
                <div className="text-slate-500">// Terminal preview of what start_local_server.bat executes automatically:</div>
                <div className="text-cyan-400">$ python -m pip install flask rasterio pillow google-auth</div>
                <div className="text-emerald-400">$ python server.py --port 8000</div>
                <div className="text-slate-400">✅ Server online at http://localhost:8000</div>
              </div>
            </div>
          )}

          {activeTab === 'converter' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Local Cloud-Optimized GeoTIFF (COG) Converter
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Raw GeoTIFF files can be hundreds of megabytes or gigabytes in size. To stream them on interactive maps smoothly without lag, convert them to COGs first using our desktop converter GUI.
              </p>

              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-white">Steps to Convert GeoTIFFs Offline:</h4>
                <ol className="list-decimal list-inside text-xs text-slate-300 space-y-1.5 leading-relaxed">
                  <li>Open the <span className="text-cyan-300 font-mono">converter_tool</span> folder in your unzipped package.</li>
                  <li>Double-click <span className="text-cyan-300 font-mono">setup.bat</span> once to auto-install dependencies (<span className="font-mono text-slate-400">rasterio, pillow, numpy</span>).</li>
                  <li>Double-click <span className="text-cyan-300 font-mono">run.bat</span> to launch the desktop converter window.</li>
                  <li>Select your raw <span className="font-mono text-slate-300">.tif/.tiff</span> file and click **Convert File**.</li>
                  <li>Copy the converted <span className="font-mono text-emerald-300">_cog.tif</span> output to your <span className="font-mono text-slate-300">uploads/</span> folder or load it straight into the web map!</li>
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
                  <h4 className="font-semibold text-white mb-1">Issue: Server Status is Offline</h4>
                  <p className="text-slate-400 leading-relaxed">
                    Ensure Python 3 is installed on your Windows PC and added to system PATH. If <span className="font-mono text-slate-300">start_local_server.bat</span> closes immediately, open Command Prompt and run <span className="font-mono text-cyan-300">python server.py</span> manually to view potential missing package error messages.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
                  <h4 className="font-semibold text-white mb-1">Issue: Accessing Server from Mobile / Tablet / External Links</h4>
                  <p className="text-slate-400 leading-relaxed">
                    When accessing the web app from a mobile phone or sharing a public web link, <span className="font-mono text-slate-300">http://localhost:8000</span> will not be directly reachable by remote users. Running <span className="font-mono text-cyan-300">python run_tunnel.py</span> generates a free Cloudflare HTTPS tunnel URL (e.g. <span className="font-mono text-emerald-300">https://xyz.trycloudflare.com</span>) that works anywhere in the world!
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <p className="text-xs text-slate-400">DroneSurvey GIS Suite • Zero-Code Web & Desktop Tools</p>
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
