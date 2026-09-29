import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Info } from 'lucide-react';

interface ZoomableBillPreviewProps {
  children: React.ReactNode;
  className?: string;
  defaultZoomMode?: 'fit' | '100%';
}

export const ZoomableBillPreview: React.FC<ZoomableBillPreviewProps> = ({
  children,
  className = '',
  defaultZoomMode = 'fit',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [zoom, setZoom] = useState<number>(1);
  const [fitZoom, setFitZoom] = useState<number>(0.5);
  const [contentHeight, setContentHeight] = useState<number>(1123);
  const [showHint, setShowHint] = useState<boolean>(true);

  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;

  const fitZoomRef = useRef<number>(fitZoom);
  fitZoomRef.current = fitZoom;

  const lastTapRef = useRef<number>(0);
  const touchStartDistRef = useRef<number>(0);
  const touchStartZoomRef = useRef<number>(1);
  const hasUserAdjustedZoom = useRef<boolean>(false);

  // Measure container and compute fit zoom
  const updateFitZoom = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    if (containerWidth <= 0) return;

    // Leave horizontal margin (16px on mobile, 32px on larger screens)
    const padding = containerWidth < 640 ? 16 : 32;
    const availableWidth = containerWidth - padding;
    // Standard invoice width is 794px
    const calculatedFit = Math.min(1.2, Math.max(0.25, Number((availableWidth / 794).toFixed(3))));
    
    setFitZoom(calculatedFit);
    if (!hasUserAdjustedZoom.current) {
      if (defaultZoomMode === 'fit') {
        setZoom(calculatedFit);
      } else {
        setZoom(1);
      }
    }
  }, [defaultZoomMode]);

  // Measure content unscaled height using ResizeObserver
  useEffect(() => {
    if (!contentRef.current) return;

    const measureHeight = () => {
      if (contentRef.current) {
        const height = contentRef.current.scrollHeight || contentRef.current.offsetHeight;
        if (height > 0) {
          setContentHeight(height);
        }
      }
    };

    measureHeight();

    const resizeObserver = new ResizeObserver(() => {
      measureHeight();
      updateFitZoom();
    });

    resizeObserver.observe(contentRef.current);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Auto dismiss touch hint after 3.5s
    const hintTimer = setTimeout(() => {
      setShowHint(false);
    }, 3500);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(hintTimer);
    };
  }, [updateFitZoom]);

  // Native touch pinch-to-zoom on mobile
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        touchStartDistRef.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStartZoomRef.current = zoomRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDistRef.current > 0) {
        e.preventDefault();
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDist / touchStartDistRef.current;
        const targetZoom = Math.min(
          2.5,
          Math.max(0.25, Number((touchStartZoomRef.current * factor).toFixed(2)))
        );
        hasUserAdjustedZoom.current = true;
        setZoom(targetZoom);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        touchStartDistRef.current = 0;
      }
    };

    // Non-passive listener so e.preventDefault() works for pinch
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // Double tap to toggle between Fit and 100%
  const handleTouchEndContainer = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      hasUserAdjustedZoom.current = true;
      setZoom((prev) => {
        const currentFit = fitZoomRef.current;
        // If close to fit, zoom to 100%, else return to fit
        if (Math.abs(prev - currentFit) < 0.08) {
          return 1.0;
        } else {
          return currentFit;
        }
      });
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  // Trackpad / Mouse wheel pinch-to-zoom (Ctrl/Cmd + wheel)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      hasUserAdjustedZoom.current = true;
      const delta = -e.deltaY * 0.005;
      setZoom((prev) => Math.min(2.5, Math.max(0.25, Number((prev + delta).toFixed(2)))));
    }
  };

  const handleZoomIn = () => {
    hasUserAdjustedZoom.current = true;
    setZoom((prev) => Math.min(2.5, Number((prev + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    hasUserAdjustedZoom.current = true;
    setZoom((prev) => Math.max(0.25, Number((prev - 0.15).toFixed(2))));
  };

  const handleFit = () => {
    hasUserAdjustedZoom.current = true;
    setZoom(fitZoom);
  };

  const handle100Percent = () => {
    hasUserAdjustedZoom.current = true;
    setZoom(1.0);
  };

  const zoomPercentDisplay = Math.round(zoom * 100);

  return (
    <div className={`relative flex-1 w-full h-full flex flex-col overflow-hidden select-none ${className}`}>
      {/* Mobile Hint Banner */}
      {showHint && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-opacity duration-500">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-black/75 backdrop-blur-md text-white text-xs rounded-full shadow-md">
            <Info className="w-3.5 h-3.5 text-blue-300 shrink-0" />
            <span>મોબાઇલમાં ઝૂમ કરવા પિંચ અથવા ડબલ ટેપ કરો</span>
          </div>
        </div>
      )}

      {/* Scrollable Viewport */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onTouchEnd={handleTouchEndContainer}
        className="flex-1 w-full h-full overflow-auto bg-slate-200/90 sm:bg-slate-100 touch-pan-x touch-pan-y"
        style={{
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          className="min-h-full flex items-start justify-center p-2 sm:p-4 pb-20"
          style={{ minWidth: '100%' }}
        >
          {/* Sizing Spacer matching scaled dimension so native 2D scroll works smoothly */}
          <div
            style={{
              width: `${794 * zoom}px`,
              height: `${contentHeight * zoom}px`,
              position: 'relative',
              flexShrink: 0,
              transition: 'width 0.1s ease-out, height 0.1s ease-out',
            }}
          >
            <div
              ref={contentRef}
              style={{
                width: '794px',
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
                boxShadow: '0 4px 25px -4px rgba(0, 0, 0, 0.18)',
                transition: 'transform 0.1s ease-out',
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Glassmorphism Zoom Bar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <div className="flex items-center gap-1 sm:gap-1.5 bg-white/95 backdrop-blur-md shadow-2xl border border-gray-200/90 rounded-full px-2.5 sm:px-3.5 py-1.5 text-gray-700">
          {/* Zoom Out Button */}
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.25}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all text-gray-700"
            title="નાનું કરો (Zoom Out)"
            aria-label="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Zoom Level Indicator */}
          <button
            type="button"
            onClick={() => {
              if (Math.abs(zoom - 1.0) < 0.05) {
                handleFit();
              } else {
                handle100Percent();
              }
            }}
            className="min-w-[48px] px-1.5 py-0.5 text-xs font-semibold text-gray-800 hover:bg-gray-100 rounded-md transition-all text-center tracking-tight"
            title="ઝૂમ રીસેટ કરવા ક્લિક કરો"
          >
            {zoomPercentDisplay}%
          </button>

          {/* Zoom In Button */}
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 2.5}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 active:scale-90 disabled:opacity-30 disabled:pointer-events-none transition-all text-gray-700"
            title="મોટું કરો (Zoom In)"
            aria-label="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-gray-300 mx-0.5" />

          {/* Fit to Screen Button */}
          <button
            type="button"
            onClick={handleFit}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full transition-all active:scale-95 ${
              Math.abs(zoom - fitZoom) < 0.02
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="આખી સ્ક્રીનમાં ફિટ કરો"
          >
            <Maximize2 className="w-3 h-3" />
            <span className="text-[11px]">પૂરું (Fit)</span>
          </button>

          {/* 100% 1:1 Button */}
          <button
            type="button"
            onClick={handle100Percent}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-all active:scale-95 ${
              Math.abs(zoom - 1.0) < 0.02
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title="અસલ માપ (1:1)"
          >
            <RotateCcw className="w-3 h-3" />
            <span className="text-[11px]">૧:૧</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ZoomableBillPreview;
