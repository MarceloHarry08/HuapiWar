import * as THREE from 'three';

/**
 * HUAPI WAR - Sistema de Partículas y Efectos Visuales Stylized PBR Painterly
 * Fogonazos, bocanadas de humo de cañón, salpicaduras de agua y las 5 bombas especiales.
 */

class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.meshPool = [];
    this.vfxGroup = new THREE.Group();
    this.scene.add(this.vfxGroup);

    // Texturas de partículas painterly generadas proceduralmente
    this.smokeTex = this.createPuffTexture('#d6d3d1', '#78716c');
    this.fireTex = this.createPuffTexture('#fef08a', '#ea580c');
    this.waterTex = this.createPuffTexture('#cffafe', '#06b6d4');
    this.iceTex = this.createPuffTexture('#e0f2fe', '#0284c7');
    this.greekFireTex = this.createPuffTexture('#bef264', '#15803d');

    // Materiales base compartidos
    this.smokeMat = new THREE.SpriteMaterial({
      map: this.smokeTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    this.fireMat = new THREE.SpriteMaterial({
      map: this.fireTex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.waterMat = new THREE.SpriteMaterial({
      map: this.waterTex,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });

    // Material de curación / reparación dorada-esmeralda
    this.healTex = this.createPuffTexture('#fef08a', '#10b981');
    this.healMat = new THREE.SpriteMaterial({
      map: this.healTex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  createPuffTexture(centerColor, edgeColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 56);
    grad.addColorStop(0.0, centerColor);
    grad.addColorStop(0.55, edgeColor);
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  spawnParticle(config) {
    const sprite = new THREE.Sprite(config.material || this.smokeMat);
    sprite.position.copy(config.position);
    sprite.scale.setScalar(config.initialScale || 1.0);

    this.vfxGroup.add(sprite);

    this.particles.push({
      sprite,
      vx: config.velocity ? config.velocity.x : 0,
      vy: config.velocity ? config.velocity.y : 0,
      vz: config.velocity ? config.velocity.z : 0,
      gravity: config.gravity || 0,
      scaleRate: config.scaleRate || 1.2,
      fadeRate: config.fadeRate || 0.8,
      opacity: config.initialOpacity || 0.9,
      lifetime: config.lifetime || 1.0,
      age: 0,
    });
  }

  /**
   * Disparo de cañón: Fogonazo brillante y bocanada de humo esponjosa
   */
  createCannonBlast(pos, dir) {
    // 1. Fogonazo frontal brillante
    this.spawnParticle({
      position: pos.clone().add(dir.clone().multiplyScalar(1.5)),
      material: this.fireMat,
      initialScale: 4.5,
      scaleRate: 2.5,
      fadeRate: 5.0,
      initialOpacity: 1.0,
      lifetime: 0.25,
    });

    // 2. Nube de humo de pólvora painterly que asciende
    const puffCount = 6;
    for (let i = 0; i < puffCount; i++) {
      const spreadDir = dir.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.2) * 0.8,
        (Math.random() - 0.5) * 0.8
      )).normalize();

      const speed = 6 + Math.random() * 8;
      this.spawnParticle({
        position: pos.clone(),
        material: this.smokeMat,
        velocity: spreadDir.multiplyScalar(speed),
        gravity: 0.8, // Flota hacia arriba
        initialScale: 2.2 + Math.random() * 1.5,
        scaleRate: 1.8,
        fadeRate: 0.65,
        initialOpacity: 0.8,
        lifetime: 1.4,
      });
    }
  }

  /**
   * Salpicadura en el lago Nahuel Huapi
   */
  createWaterSplash(x, z) {
    const pos = new THREE.Vector3(x, 0.5, z);
    // Gotas eyectadas verticalmente
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      this.spawnParticle({
        position: pos.clone(),
        material: this.waterMat,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          10 + Math.random() * 8,
          Math.sin(angle) * speed
        ),
        gravity: -22, // Cae por gravedad
        initialScale: 1.4,
        scaleRate: 0.8,
        fadeRate: 0.9,
        initialOpacity: 0.9,
        lifetime: 0.9,
      });
    }

    // Anillo de espuma expansivo sobre el agua
    this.createShockwaveRing(pos, 0x5eead4, 18, 0.7);
  }

  /**
   * Impacto de bala de cañón contra el casco de un barco
   */
  createHullHit(x, y, z, damage) {
    const pos = new THREE.Vector3(x, y, z);

    // Fuego de impacto
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 6;
      this.spawnParticle({
        position: pos.clone(),
        material: this.fireMat,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          2 + Math.random() * 5,
          Math.sin(angle) * speed
        ),
        gravity: -5,
        initialScale: 2.5,
        scaleRate: 1.2,
        fadeRate: 2.5,
        lifetime: 0.5,
      });
    }

    // Astillas y humo negro
    for (let i = 0; i < 6; i++) {
      this.spawnParticle({
        position: pos.clone(),
        material: this.smokeMat,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          4 + Math.random() * 6,
          (Math.random() - 0.5) * 5
        ),
        gravity: 1.2,
        initialScale: 2.8,
        scaleRate: 2.2,
        fadeRate: 0.7,
        lifetime: 1.2,
      });
    }
  }

  /**
   * Explosiones de las 5 Bombas Especiales
   */
  createSpecialDetonation(x, y, z, type) {
    const pos = new THREE.Vector3(x, y, z);

    if (type === 'greek_fire') {
      // FUEGO GRIEGO: Llamarada verde esmeralda y naranja expansiva
      const mat = new THREE.SpriteMaterial({
        map: this.greekFireTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
      });
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 10;
        this.spawnParticle({
          position: pos.clone(),
          material: mat,
          velocity: new THREE.Vector3(Math.cos(angle) * speed, 3 + Math.random() * 8, Math.sin(angle) * speed),
          gravity: -2,
          initialScale: 3.5,
          scaleRate: 2.2,
          fadeRate: 0.8,
          lifetime: 1.6,
        });
      }
      this.createShockwaveRing(pos, 0x84cc16, 26, 1.2);
    } else if (type === 'cluster_bomb') {
      // BOMBA RACIMO GLACIAR: Estallido cian con esquirlas de hielo
      const mat = new THREE.SpriteMaterial({
        map: this.iceTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
      });
      for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 12 + Math.random() * 14;
        this.spawnParticle({
          position: pos.clone(),
          material: mat,
          velocity: new THREE.Vector3(Math.cos(angle) * speed, 6 + Math.random() * 10, Math.sin(angle) * speed),
          gravity: -15,
          initialScale: 2.2,
          scaleRate: 1.1,
          fadeRate: 1.2,
          lifetime: 1.1,
        });
      }
      this.createShockwaveRing(pos, 0x38bdf8, 30, 0.9);
    } else if (type === 'torpedo') {
      // TORPEDO NAHUELITO: Géiser gigante vertical de agua y espuma
      for (let i = 0; i < 35; i++) {
        this.spawnParticle({
          position: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)),
          material: this.waterMat,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 4, 25 + Math.random() * 15, (Math.random() - 0.5) * 4),
          gravity: -28,
          initialScale: 3.0,
          scaleRate: 1.5,
          fadeRate: 0.6,
          lifetime: 1.8,
        });
      }
      this.createShockwaveRing(pos, 0x06b6d4, 32, 1.4);
    } else if (type === 'seismic_charge') {
      // CARGA SÍSMICA: Onda expansiva cósmica y pulso sonoro
      this.createShockwaveRing(pos, 0x3b82f6, 50, 1.8);
      for (let i = 0; i < 18; i++) {
        this.spawnParticle({
          position: pos.clone(),
          material: this.fireMat,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 8, 8 + Math.random() * 6, (Math.random() - 0.5) * 8),
          gravity: -5,
          initialScale: 4.0,
          scaleRate: 2.5,
          fadeRate: 1.1,
          lifetime: 1.2,
        });
      }
    } else {
      // METRALLA ÍGNEA: Lluvia de metralla incandescente
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 15 + Math.random() * 18;
        this.spawnParticle({
          position: pos.clone(),
          material: this.fireMat,
          velocity: new THREE.Vector3(Math.cos(angle) * speed, 10 + Math.random() * 12, Math.sin(angle) * speed),
          gravity: -20,
          initialScale: 2.0,
          scaleRate: 0.9,
          fadeRate: 1.5,
          lifetime: 0.9,
        });
      }
      this.createShockwaveRing(pos, 0xf97316, 24, 0.8);
    }
  }

  /**
   * Efecto de Curación y Reparación del Barco (Partículas doradas y esmeraldas)
   */
  createHealingSparkles(pos) {
    for (let i = 0; i < 24; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1.0 + Math.random() * 4.5;
      this.spawnParticle({
        position: new THREE.Vector3(
          pos.x + Math.cos(angle) * dist,
          pos.y + 1.0 + Math.random() * 2.0,
          pos.z + Math.sin(angle) * dist
        ),
        material: this.healMat,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          5 + Math.random() * 6,
          (Math.random() - 0.5) * 2
        ),
        gravity: 0.5,
        initialScale: 1.8,
        scaleRate: 0.8,
        fadeRate: 0.7,
        lifetime: 1.4,
      });
    }
    this.createShockwaveRing(pos, 0x10b981, 16, 0.8);
  }

  /**
   * Humo de deterioro progresivo en cubierta cuando la salud baja
   */
  createShipDamageSmoke(pos, scale = 1.0) {
    const spread = 2.5 * scale;
    this.spawnParticle({
      position: new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * spread,
        pos.y + 2.0,
        pos.z + (Math.random() - 0.5) * spread
      ),
      material: this.smokeMat,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        3.5 + Math.random() * 2.5,
        (Math.random() - 0.5) * 1.5
      ),
      gravity: 0.4,
      initialScale: 2.2 * scale,
      scaleRate: 1.4,
      fadeRate: 0.75,
      lifetime: 1.3,
    });
  }

  /**
   * Fuego activo en cubierta cuando el barco está en estado crítico (<40% HP)
   */
  createShipDeckFire(pos) {
    this.spawnParticle({
      position: new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * 3.0,
        pos.y + 1.8 + Math.random() * 1.5,
        pos.z + (Math.random() - 0.5) * 3.0
      ),
      material: this.fireMat,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        4.0 + Math.random() * 3.0,
        (Math.random() - 0.5) * 1.2
      ),
      gravity: 0.2,
      initialScale: 2.8,
      scaleRate: 0.9,
      fadeRate: 2.2,
      lifetime: 0.45,
    });

    // Columna de humo negro denso
    if (Math.random() < 0.45) {
      this.createShipDamageSmoke(pos, 1.4);
    }
  }

  /**
   * Colisión y embestida violenta entre cascos de barcos (Astillas y choque)
   */
  createWoodCollisionCrash(pos) {
    // Astillas incandescentes y fragmentos
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 10;
      this.spawnParticle({
        position: new THREE.Vector3(pos.x, 2.5, pos.z),
        material: this.fireMat,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          4 + Math.random() * 8,
          Math.sin(angle) * speed
        ),
        gravity: -16,
        initialScale: 1.8,
        scaleRate: 0.8,
        fadeRate: 1.8,
        lifetime: 0.7,
      });
    }

    // Gran bocanada de polvo y astillas
    for (let i = 0; i < 8; i++) {
      this.spawnParticle({
        position: new THREE.Vector3(pos.x, 2.0, pos.z),
        material: this.smokeMat,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          3 + Math.random() * 4,
          (Math.random() - 0.5) * 6
        ),
        gravity: 0.5,
        initialScale: 3.5,
        scaleRate: 2.0,
        fadeRate: 0.9,
        lifetime: 1.2,
      });
    }

    this.createShockwaveRing(pos, 0xffaa33, 22, 0.7);
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      if (p.isRing) {
        p.elapsed += dt;
        const progress = p.elapsed / p.duration;
        if (progress >= 1.0) {
          this.vfxGroup.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          this.particles.splice(i, 1);
        } else {
          const currentRadius = 1.0 + (p.maxRadius - 1.0) * Math.pow(progress, 0.5);
          p.mesh.scale.setScalar(currentRadius);
          p.mesh.material.opacity = (1.0 - progress) * 0.9;
        }
        continue;
      }

      p.age += dt;
      if (p.age >= p.lifetime) {
        this.vfxGroup.remove(p.sprite);
        this.particles.splice(i, 1);
        continue;
      }

      // Cinemática
      p.vy += p.gravity * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.z += p.vz * dt;

      // Escala y desvanecimiento
      const currentScale = p.sprite.scale.x * (1 + p.scaleRate * dt);
      p.sprite.scale.setScalar(currentScale);

      p.opacity = Math.max(0, p.opacity - p.fadeRate * dt);
      p.sprite.material.opacity = p.opacity;
    }
  }
}

export function initVFX(scene) {
  return new ParticleSystem(scene);
}
