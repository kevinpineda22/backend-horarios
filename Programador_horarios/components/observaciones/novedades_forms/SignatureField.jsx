import React, { useRef, forwardRef, useImperativeHandle } from "react";
import SignatureCanvas from "react-signature-canvas";

const SignatureField = forwardRef(
  ({ onEnd, onBegin, width = 480, height = 150 }, ref) => {
    const sigPad = useRef(null);

    useImperativeHandle(ref, () => ({
      clear: () => {
        if (sigPad.current) sigPad.current.clear();
      },
      isEmpty: () => (sigPad.current ? sigPad.current.isEmpty() : true),
      toDataURL: (format = "image/png") => {
        return sigPad.current ? sigPad.current.toDataURL(format) : null;
      },
      fromDataURL: (dataUrl, options) => {
        if (!sigPad.current || !dataUrl) return;
        try {
          sigPad.current.fromDataURL(dataUrl, options);
        } catch (error) {
          // Fallback defensively if react-signature-canvas rejects the data
          console.error("SignatureField.fromDataURL error", error);
        }
      },
    }));

    // Simplemente reenviamos los eventos al componente padre/wrapper
    const handleEnd = () => {
      if (onEnd) onEnd();
    };

    const handleBegin = () => {
      if (onBegin) onBegin();
    };

    return (
      <div style={{ width: "100%", position: "relative" }}>
        <SignatureCanvas
          ref={sigPad}
          penColor="rgb(49, 49, 49)"
          canvasProps={{
            width,
            height,
            className: "sig-canvas",
            style: {
              width: "100%",
              maxWidth: `${width}px`,
              height: `${height}px`,
            },
          }}
          onBegin={handleBegin}
          onEnd={handleEnd}
          clearOnResize={false}
        />
      </div>
    );
  }
);

SignatureField.displayName = "SignatureField";

export default SignatureField;
