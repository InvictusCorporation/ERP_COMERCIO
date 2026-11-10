"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X, ScanLine } from "lucide-react";
type Detector = {
    detect: (source: HTMLVideoElement) => Promise<{
        rawValue: string;
    }[]>;
};
type DetectorConstructor = {
    new (options: {
        formats: string[];
    }): Detector;
    getSupportedFormats: () => Promise<string[]>;
};
export function PosScanner({ onRead }: {
    onRead: (code: string) => Promise<void>;
}) {
    const [open, setOpen] = useState(false), [message, setMessage] = useState(""), [paused, setPaused] = useState(false);
    const video = useRef<HTMLVideoElement>(null), locked = useRef(false), read = useRef(onRead);
    read.current = onRead;
    useEffect(() => {
        if (!open)
            return;
        let stopped = false, stream: MediaStream | undefined, controls: {
            stop: () => void;
        } | undefined, timer: ReturnType<typeof setTimeout> | undefined;
        const stop = () => { stopped = true; if (timer)
            clearTimeout(timer); controls?.stop(); stream?.getTracks().forEach(t => t.stop()); if (video.current)
            video.current.srcObject = null; };
        const found = async (code: string) => { if (stopped || locked.current)
            return; locked.current = true; setPaused(true); try {
            await read.current(code);
            setMessage("Código lido. Confira o carrinho antes de continuar.");
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "Produto não encontrado.");
        } };
        const start = async () => {
            try {
                if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
                    throw Error("A câmera precisa de HTTPS ou localhost. Use a busca ou digite o código.");
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
                if (stopped) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                const v = video.current;
                if (!v)
                    return;
                v.srcObject = stream;
                await v.play();
                if (stopped)
                    return;
                const Native = (window as unknown as {
                    BarcodeDetector?: DetectorConstructor;
                }).BarcodeDetector;
                let detector: Detector | undefined;
                if (Native) {
                    const formats = (await Native.getSupportedFormats()).filter(f => ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"].includes(f));
                    if (formats.length)
                        detector = new Native({ formats });
                }
                if (stopped)
                    return;
                if (detector) {
                    const scan = async () => { if (stopped)
                        return; try {
                        if (!locked.current && v.readyState >= 2) {
                            const codes = await detector!.detect(v);
                            if (codes[0])
                                await found(codes[0].rawValue);
                        }
                    }
                    catch { /* a frame may be unavailable */ } if (!stopped)
                        timer = setTimeout(scan, 180); };
                    await scan();
                }
                else {
                    const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
                    if (stopped)
                        return;
                    const reader = new BrowserMultiFormatOneDReader();
                    controls = await reader.decodeFromStream(stream, v, result => { if (result)
                        void found(result.getText()); });
                    if (stopped)
                        controls.stop();
                }
            }
            catch (e) {
                stop();
                setMessage(e instanceof DOMException && e.name === "NotAllowedError" ? "Permissão da câmera recusada. Use a busca ou o código manual." : e instanceof Error ? e.message : "Não foi possível abrir a câmera.");
            }
        };
        locked.current = false;
        setPaused(false);
        setMessage("");
        void start();
        const hide = () => { if (document.hidden) {
            stop();
            setOpen(false);
        } };
        document.addEventListener("visibilitychange", hide);
        return () => { document.removeEventListener("visibilitychange", hide); stop(); };
    }, [open]);
    return <div className="pos-scanner"><button type="button" className="pos-gold" onClick={() => setOpen(v => !v)}><Camera size={19}/> {open ? "Fechar câmera" : "Leitor (câmera)"}</button>{open && <div className="pos-camera"><video ref={video} muted playsInline aria-label="Câmera para leitura de código de barras"/><div className="pos-reticle"><ScanLine size={60}/></div><button className="pos-camera-close" aria-label="Fechar câmera" onClick={() => setOpen(false)}><X /></button><p role="status">{message || "Aponte para o código de barras do produto."}</p>{paused && <button onClick={() => { locked.current = false; setPaused(false); setMessage(""); }}>Continuar leitura</button>}</div>}</div>;
}
