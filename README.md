# ⚓ HUAPI WAR

> **Juego de Guerra de Barcos Multijugador 3D en Tiempo Real en el Lago Nahuel Huapi**
> Ambientado en Bariloche, Patagonia Argentina. Estilo visual *Stylized PBR Painterly* (inspirado en *Sea of Thieves*).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Three.js](https://img.shields.io/badge/Three.js-WebGL-black.svg)
![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101.svg)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57.svg)

---

## 🌟 Características Principales

- **Multijugador en Tiempo Real (Socket.io):**
  - **Límite de Sala:** 10 capitanes en combate simultáneo en el lago Nahuel Huapi.
  - **Sistema de Cola FIFO:** A partir del jugador 11, se ingresa automáticamente a una cola de espera con aviso modal: *"Esperando lugar para ingresar..."* hasta que un slot se libere.
  - **Snapshot Interpolation:** Búfer de interpolación lineal (`lerp`) y esférica (`slerp`) a 25 Hz para movimientos fluidos sin saltos de latencia.
- **Astillero y Personalizador 3D:**
  - **5 Tipos de Chasis:** Corbeta Ligera, Bergantín Patagónico, Fragata Nahuel, Galeón Pesado y Monitor Acorazado con chimenea a vapor.
  - **5 Facciones:** Argentinos, Piratas, Españoles, Portugueses y Franceses con banderas y velámenes heráldicos.
  - **5 Baterías de Cañones:** Bronce, Colisa Pesada, Carronada Devastadora, Culebrina Larga y Mortero Triple.
  - **5 Armas Especiales (3 Cargas por Vida):** Fuego Griego Patagónico, Bomba Racimo Glaciar, Torpedo Nahuelito, Metralla Ígnea y Carga Sísmica.
  - **Nombre en el Casco:** Renderizado dinámico en tiempo real del nombre elegido proyectado en babor y estribor del casco 3D.
  - **Personalización de HUD:** Selector cromático de colores de interfaz.
- **Física Lacustre y Sombreado Stylized PBR:**
  - Agua con dispersión de luz profunda (azul/verde esmeralda) y *Subsurface Scattering (SSS)* en las crestas de olas.
  - Anillos de espuma cel-shading en la línea de flotación de los cascos.
  - Cordillera de los Andes circundante con cumbres nevadas (Cerro Catedral, Tronador), Isla Victoria y nubes volumétricas 3D esculpidas.
- **Mecánicas de Combate:**
  - Barra de integridad del casco (100 HP).
  - Medidor de sobrecalentamiento: 10 segundos continuos de disparo activan **15 segundos de bloqueo por enfriamiento** con alarma visual y sonora.
  - Impactos confirmados (+100 pts) y hundimientos (+500 pts).
- **Persistencia en Base de Datos (SQLite):**
  - Guardado y carga de diseños de barcos creados.
  - Tabla de líderes global que registra a los mejores capitanes ("desde Comodoro Rivadavia hasta el resto del país").
- **Audio Procedural Dinámico:**
  - **Tone.js:** Música de combate procedural con riffs enérgicos de classic rock y heavy metal (batería 4/4, bajo galopante y guitarras distorsionadas).
  - **Howler.js / Web Audio:** Efectos de sonido espaciales 3D en estéreo posicional para cañones, impactos y detonaciones.

---

## 🎮 Controles de Juego

| Tecla / Acción | Función |
| :--- | :--- |
| <kbd>W</kbd> / <kbd>Flecha Arriba</kbd> | Acelerar hacia adelante |
| <kbd>S</kbd> / <kbd>Flecha Abajo</kbd> | Marcha atrás / Freno |
| <kbd>A</kbd> / <kbd>Flecha Izquierda</kbd> | Girar timón a babor (Izquierda) |
| <kbd>D</kbd> / <kbd>Flecha Derecha</kbd> | Girar timón a estribor (Derecha) |
| <kbd>Espacio</kbd> o <kbd>Click Izquierdo</kbd> | Disparar baterías de cañones |
| <kbd>E</kbd> / <kbd>Q</kbd> | Disparar Arma Especial seleccionada |

---

## 🚀 Instalación y Ejecución

### Opción 1: Scripts Batch (Windows)
1. Ejecuta `install.bat` para inicializar e instalar todas las dependencias.
2. Ejecuta `run.bat` para arrancar el servidor.
3. Abre tu navegador en [http://localhost:3000](http://localhost:3000).

### Opción 2: Terminal / Consola
```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor
node server.js
```
El servidor arrancará en el puerto local: `http://localhost:3000`.

---

## 📁 Estructura del Proyecto

```
Fly/
├── huapi_war.db          # Base de datos SQLite (Barcos y Clasificación)
├── install.bat           # Script de instalación de dependencias
├── run.bat               # Script de ejecución del servidor
├── server.js             # Servidor autoritativo Node.js / Socket.io / SQLite
├── package.json          # Configuración del paquete y dependencias
├── .gitignore            # Exclusiones de Git
├── README.md             # Documentación del proyecto
└── public/               # Frontend completo (Strict isolation)
    ├── index.html        # Estructura del juego, HUD, modales y astillero
    ├── css/
    │   └── style.css     # Estilos estilizados náuticos y responsive UI
    └── js/
        ├── main.js       # Bucle de juego, cámara y orquestador
        ├── network.js    # Cliente Socket.io y Snapshot Interpolation
        ├── shipBuilder.js# Generador procedural de barcos 3D PBR
        ├── water.js      # Shader de agua esmeralda del Nahuel Huapi
        ├── environment.js# Cordillera andina, Isla Victoria y nubes 3D
        ├── vfx.js        # Sistemas de partículas estilizadas
        └── audio.js      # Tone.js (Rock procedural) y Howler.js (Audio 3D)
```

---

## 📜 Licencia

Desarrollado bajo licencia MIT. ¡Que los vientos patagónicos guíen tu timón!
