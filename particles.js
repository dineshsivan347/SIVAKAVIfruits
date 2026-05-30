/**
 * Fruit Stock Analyzer - Futuristic Ambient Particles Engine
 * Renders slow-drifting neon particles and glowing gas clouds on a full-screen canvas.
 */
class AmbientParticles {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.clouds = [];
        
        // Glow palette customized for our Tamil Nadu Fruit Analyzer
        // Neon green (Optimal / Mango peak) & Electric Blue (Analytics / Tech)
        this.colors = [
            'rgba(16, 185, 129, ', // Neon Green
            'rgba(59, 130, 246, ', // Electric Blue
            'rgba(245, 158, 11, ', // Mango Gold
            'rgba(239, 68, 68, '   // Apple Crimson
        ];

        this.init();
        this.animate();
        
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    init() {
        this.resize();
        
        // Spawn small floating dust particles
        const particleCount = Math.min(60, Math.floor((this.width * this.height) / 25000));
        for (let i = 0; i < particleCount; i++) {
            this.particles.push(this.createParticle());
        }

        // Spawn 3 large glowing blurred ambient gas clouds
        for (let i = 0; i < 3; i++) {
            this.clouds.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Math.random() * 200 + 200,
                color: i === 0 ? 'rgba(16, 185, 129, 0.05)' : i === 1 ? 'rgba(59, 130, 246, 0.05)' : 'rgba(245, 158, 11, 0.03)',
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3
            });
        }
    }

    resize() {
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    }

    createParticle() {
        return {
            x: Math.random() * this.width,
            y: Math.random() * this.height,
            size: Math.random() * 3.5 + 0.5,
            colorPrefix: this.colors[Math.floor(Math.random() * this.colors.length)],
            alpha: Math.random() * 0.5 + 0.1,
            fadeSpeed: (Math.random() * 0.005 + 0.002) * (Math.random() > 0.5 ? 1 : -1),
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4
        };
    }

    handleMouseMove(e) {
        // Gently push particles away from mouse
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        
        this.particles.forEach(p => {
            const dx = p.x - mouseX;
            const dy = p.y - mouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 180) {
                const force = (180 - dist) / 180;
                p.vx += (dx / dist) * force * 0.1;
                p.vy += (dy / dist) * force * 0.1;
            }
        });
    }

    animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // 1. Draw large neon gas clouds
        this.clouds.forEach(c => {
            c.x += c.vx;
            c.y += c.vy;
            
            // Boundary bounce
            if (c.x < -100 || c.x > this.width + 100) c.vx *= -1;
            if (c.y < -100 || c.y > this.height + 100) c.vy *= -1;
            
            const grad = this.ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.radius);
            grad.addColorStop(0, c.color);
            grad.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // 2. Draw small floating particles
        this.particles.forEach((p, index) => {
            p.x += p.vx;
            p.y += p.vy;
            
            // Friction/drifting cap
            p.vx *= 0.98;
            p.vy *= 0.98;
            
            // Minimal float drift
            p.vx += (Math.random() - 0.5) * 0.02;
            p.vy += (Math.random() - 0.5) * 0.02;

            // Fade alpha pulsing
            p.alpha += p.fadeSpeed;
            if (p.alpha > 0.75 || p.alpha < 0.1) {
                p.fadeSpeed = -p.fadeSpeed;
            }
            
            // Screen wrap
            if (p.x < 0) p.x = this.width;
            if (p.x > this.width) p.x = 0;
            if (p.y < 0) p.y = this.height;
            if (p.y > this.height) p.y = 0;
            
            // Render particle
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.colorPrefix + p.alpha.toFixed(2) + ')';
            
            // Optional tiny glow filter for larger dust particles
            if (p.size > 2) {
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = p.colorPrefix + '0.4)';
            } else {
                this.ctx.shadowBlur = 0;
            }
            
            this.ctx.fill();
        });
        
        this.ctx.shadowBlur = 0; // reset
        requestAnimationFrame(() => this.animate());
    }
}

// Instantiate particles when loaded
document.addEventListener('DOMContentLoaded', () => {
    new AmbientParticles('bg-particles');
});
