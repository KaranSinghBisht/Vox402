"use client";
import React, { useState, useEffect, useRef } from "react";

export function AvaAvatar() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ x: 0, y: 0, rotateX: 0, rotateY: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const maxOffset = 12;
            const maxRotate = 4;

            const x = ((e.clientX - centerX) / window.innerWidth) * maxOffset;
            const y = ((e.clientY - centerY) / window.innerHeight) * maxOffset;

            const rotateY = ((e.clientX - centerX) / window.innerWidth) * maxRotate;
            const rotateX = -((e.clientY - centerY) / window.innerHeight) * maxRotate;

            setTransform({ x, y, rotateX, rotateY });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center"
            style={{ perspective: "1000px" }}
        >
            {/* Glow effect behind avatar */}
            <div
                className="absolute inset-0 bg-gradient-radial from-avax-red/40 via-avax-red/15 to-transparent blur-3xl scale-150"
                style={{
                    transform: `translate(${transform.x * 0.3}px, ${transform.y * 0.3}px)`,
                    transition: "transform 0.4s ease-out",
                }}
            />

            {/* Video container with circular crop */}
            <div
                className="relative z-10 w-full aspect-square overflow-hidden rounded-full"
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg)`,
                    transition: "transform 0.2s ease-out",
                    transformStyle: "preserve-3d",
                }}
            >
                {/* Video with dark background */}
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute top-1/2 left-1/2 h-full w-auto min-w-[177.78%] -translate-x-1/2 -translate-y-1/2 object-cover"
                >
                    <source src="/ava-video.mp4" type="video/mp4" />
                </video>
            </div>
        </div>
    );
}




