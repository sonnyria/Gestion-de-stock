import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { readBarcodeWithGemini } from '../services/geminiService.ts';

interface ScannerProps {
  onScan: (barcode: string) => void;
  onCancel: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, onCancel }) => {
  const webcamRef = useRef<Webcam>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Torch / Flashlight state
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Camera selection state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // Initialize from localStorage
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(() => {
      return localStorage.getItem('scanner_device_id') || undefined;
  });

  // Load available devices
  const handleDevices = useCallback(async () => {
    try {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = mediaDevices.filter(({ kind }) => kind === "videoinput");
      setDevices(videoDevices);
    } catch (e) {
      console.error("Error enumerating devices:", e);
    }
  }, []);

  useEffect(() => {
    handleDevices();
  }, [handleDevices]);

  // Handle camera selection change
  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    if (deviceId) {
      setSelectedDeviceId(deviceId);
      localStorage.setItem('scanner_device_id', deviceId);
    } else {
      setSelectedDeviceId(undefined);
      localStorage.removeItem('scanner_device_id');
    }
    // Reset torch state when changing camera
    setTorchOn(false);
    setTorchSupported(false);
  };

  // Check for torch support when camera loads
  const handleUserMedia = (stream: MediaStream) => {
      handleDevices(); // Update device list names
      
      const track = stream.getVideoTracks()[0];
      if (track) {
          // Use 'any' cast because 'torch' is not yet standard in all TS definitions
          const capabilities = track.getCapabilities() as any;
          if (capabilities.torch) {
              setTorchSupported(true);
          } else {
              setTorchSupported(false);
          }
      }
  };

  // Handle camera errors (e.g. saved device not found)
  const handleUserMediaError = useCallback(() => {
      if (selectedDeviceId) {
          console.warn("Selected camera failed, falling back to default.");
          setSelectedDeviceId(undefined);
          localStorage.removeItem('scanner_device_id');
          setError(null); // Retry immediately
      } else {
          setError("Impossible d'accéder à la caméra.");
      }
  }, [selectedDeviceId]);

  const toggleTorch = async () => {
      if (!webcamRef.current || !torchSupported) return;
      
      const stream = webcamRef.current.video?.srcObject as MediaStream;
      const track = stream?.getVideoTracks()[0];
      
      if (track) {
          try {
              await track.applyConstraints({
                  advanced: [{ torch: !torchOn } as any]
              });
              setTorchOn(!torchOn);
          } catch (err) {
              console.error("Failed to toggle torch", err);
          }
      }
  };

  const videoConstraints = {
    width: { min: 1280, ideal: 1920 }, // Force high resolution for barcode clarity
    height: { min: 720, ideal: 1080 },
    deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
    facingMode: selectedDeviceId ? undefined : "environment"
  };

  // Automatic Scanning Logic
  const captureAndScan = useCallback(async () => {
    if (!webcamRef.current || scanning) return;

    const imageSrc = webcamRef.current.getScreenshot({width: 1920, height: 1080});
    if (!imageSrc) return;

    setScanning(true);
    // Don't clear error here to avoid flickering if there is a persistent hardware error
    
    try {
      // Use Gemini to read the barcode
      const barcode = await readBarcodeWithGemini(imageSrc);
      
      if (barcode) {
        onScan(barcode);
        // Note: scanning remains true here until the parent component unmounts this scanner
        // or changes the view, preventing duplicate scans.
      } 
      // If not found, we just finish this cycle silently and let the interval trigger again.
    } catch (e) {
      console.error("Scan cycle error", e);
    } finally {
      // Only reset scanning if we didn't find a barcode (to keep trying)
      // If we found one, onScan triggers a view change anyway.
      setScanning(false);
    }
  }, [webcamRef, scanning, onScan]);

  // Trigger scan loop
  useEffect(() => {
    const intervalId = setInterval(() => {
        if (!scanning && !error) {
            captureAndScan();
        }
    }, 1500); // Scan every 1.5 seconds to balance responsiveness and API rate limits

    return () => clearInterval(intervalId);
  }, [scanning, error, captureAndScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden bg-black">
        
        {/* Top Controls - Added pt-safe and mt-safe for notch handling */}
        <div className="absolute top-0 left-0 right-0 z-30 flex justify-between items-start px-4 pt-safe mt-4">
            {/* Camera Selector */}
            <div className="flex-1 flex justify-center mr-10"> {/* mr-10 reserves space for the torch button */}
                <select
                className="bg-black/60 text-white border border-gray-500 rounded-full px-4 py-2 text-sm backdrop-blur-sm max-w-full outline-none focus:border-blue-500 appearance-none truncate shadow-lg"
                value={selectedDeviceId || ""}
                onChange={handleCameraChange}
                >
                <option value="">Caméra automatique</option>
                {devices.map((device, key) => (
                    <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Caméra ${key + 1}`}
                    </option>
                ))}
                </select>
            </div>

            {/* Torch Button (Only if supported) */}
            {torchSupported && (
                <button 
                    onClick={toggleTorch}
                    className={`absolute right-4 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm border transition-all shadow-lg ${
                        torchOn 
                        ? 'bg-yellow-500/80 border-yellow-400 text-white shadow-[0_0_15px_rgba(234,179,8,0.6)]' 
                        : 'bg-black/60 border-gray-500 text-gray-300'
                    }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={torchOn ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </button>
            )}
        </div>

        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          screenshotQuality={1}
          forceScreenshotSourceSize={true}
          videoConstraints={videoConstraints}
          onUserMedia={handleUserMedia} 
          onUserMediaError={handleUserMediaError}
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Scanner Overlay */}
        <div className="absolute inset-0 border-[40px] border-black/50 flex items-center justify-center pointer-events-none">
          <div className={`w-72 h-48 border-2 rounded-lg relative shadow-[0_0_50px_rgba(59,130,246,0.5)] transition-colors duration-300 ${scanning ? 'border-blue-500 bg-blue-500/10' : 'border-white/50'}`}>
             
             {/* Corner Markers */}
             <div className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 -mt-1 -ml-1 ${scanning ? 'border-blue-400' : 'border-white'}`}></div>
             <div className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 -mt-1 -mr-1 ${scanning ? 'border-blue-400' : 'border-white'}`}></div>
             <div className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 -mb-1 -ml-1 ${scanning ? 'border-blue-400' : 'border-white'}`}></div>
             <div className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 -mb-1 -mr-1 ${scanning ? 'border-blue-400' : 'border-white'}`}></div>
             
             {/* Scanning Line Animation */}
             <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-[scan_2s_ease-in-out_infinite]"></div>

             <div className="absolute inset-x-0 -bottom-10 text-center">
                <p className="text-white text-sm font-bold bg-black/60 px-3 py-1 rounded-full inline-block shadow-lg backdrop-blur-md">
                  {scanning ? 'Analyse en cours...' : 'Recherche automatique...'}
                </p>
             </div>
          </div>
        </div>
        
        {/* Error Message (Only for hardware errors now) */}
        {error && (
          <div className="absolute top-24 left-4 right-4 bg-red-600/90 text-white p-4 rounded-xl text-center shadow-xl z-20 border border-red-400 animate-fade-in">
            <p className="font-bold text-lg">⚠️ {error}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="h-24 bg-gray-900 flex items-center justify-center px-8 pb-safe border-t border-gray-800 relative">
        <button 
          onClick={onCancel}
          className="absolute left-8 text-gray-400 hover:text-white font-medium py-3 px-6 rounded-full border border-gray-600 hover:bg-gray-800 transition"
        >
          Annuler
        </button>
        
        <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-widest animate-pulse">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Auto-Scan Actif
            </div>
        </div>

        <div className="absolute right-8 w-24 text-right text-xs text-gray-500">
          <span className="block text-blue-400 font-bold text-lg">IA</span>
          Gemini Vision
        </div>
      </div>
      
      <style>{`
        @keyframes scan {
            0%, 100% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            50% { top: 100%; }
            90% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default Scanner;