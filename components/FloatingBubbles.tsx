'use client';

import { useEffect, useState } from 'react';

interface Bubble {
    id: number;
    size: number;
    left: number;
    animationDuration: number;
    animationDelay: number;
    opacity: number;
    color: string;
}

export default function FloatingBubbles() {
    const [bubbles, setBubbles] = useState<Bubble[]>([]);

    useEffect(() => {
        // Generate bubbles only on client side to avoid hydration mismatch
        const colors = [
            'bg-orange-500',
            'bg-orange-400',
            'bg-amber-500',
            'bg-amber-400',
            'bg-orange-300',
        ];

        const newBubbles = Array.from({ length: 20 }).map((_, i) => ({
            id: i,
            size: Math.random() * 60 + 20, // 20px to 80px
            left: Math.random() * 100, // 0% to 100%
            animationDuration: Math.random() * 15 + 15, // 15s to 30s
            animationDelay: Math.random() * 10, // 0s to 10s
            opacity: Math.random() * 0.2 + 0.1, // 0.1 to 0.3
            color: colors[Math.floor(Math.random() * colors.length)],
        }));

        setBubbles(newBubbles);
    }, []);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {bubbles.map((bubble) => (
                <div
                    key={bubble.id}
                    className={`absolute rounded-full ${bubble.color} animate-float`}
                    style={{
                        width: `${bubble.size}px`,
                        height: `${bubble.size}px`,
                        left: `${bubble.left}%`,
                        bottom: `-${bubble.size}px`, // Start just below the screen
                        opacity: bubble.opacity,
                        animationDuration: `${bubble.animationDuration}s`,
                        animationDelay: `-5s`, // Negative delay to have some bubbles already visible
                        // We use a custom style for the animation delay to ensure they are spread out
                        // but we want them to effectively loop.
                        // Actually, let's use the random delay we generated.
                    }}
                >
                    {/* Inner highlight for bubble effect */}
                    <div className="absolute top-[20%] right-[20%] w-[20%] h-[20%] bg-white/40 rounded-full blur-[1px]" />
                </div>
            ))}
        </div>
    );
}
