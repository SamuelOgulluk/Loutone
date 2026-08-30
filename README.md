# Loutone — DAW local

Application DAW desktop locale (Tauri 2 + Vite + React + Web Audio). Nom inspiré des loutres + du son (*tone*). Pas d'IA en V1.

**Demo en ligne :** https://samuelogulluk.github.io/loutone/ (l’ancienne URL `/lutra/` redirige après le rename du dépôt)

## Prérequis

- Node.js 20+
- Pour le shell natif Tauri : [Rust](https://rustup.rs/) + toolchain Windows (MSVC Build Tools)

Sans Rust, le frontend tourne entièrement dans le navigateur.

## Lancer

```powershell
npm install
npm run dev
```

Ouvre http://localhost:1420 — clique une fois pour débloquer l'audio, puis **Space** pour play.

Avec Rust installé :

```powershell
npm run tauri:dev
```

## Déploiement

Chaque push sur `master` déploie le site via GitHub Actions → GitHub Pages.
## Raccourcis

| Touche | Action |
|--------|--------|
| Space | Play / Pause |
| S | Snap on/off |
| Q | Quantize sélection |
| Delete | Supprimer notes / clip |
| Home | Retour au début |
| Ctrl+S | Sauver projet |
| Ctrl+O | Ouvrir projet |
| Ctrl+N | Nouveau projet |

## Structure clé

```
src/
  app/App.tsx              # Layout studio
  store/useDawStore.ts     # État projet (Zustand)
  audio/engine.ts          # Moteur Web Audio + worklet
  audio/effects.ts         # Reverb / Echo / Comp / EQ
  instruments/             # Registry + built-ins
  midi/                    # Notes, accords, MIDI I/O
  project/demo.ts          # Projet démo
  project/io.ts            # Save/load JSON
  ui/                      # Transport, Arrangement, Piano roll, Mixer, Inspector, Browser
public/worklets/           # AudioWorklet scheduler
src-tauri/                 # Shell Tauri 2
```

## Fonctionnalités V1

- Transport BPM / signature / boucle
- Arrangement audio + MIDI (DnD wav/mp3/ogg, mute/solo, zoom)
- Piano roll (dessin, quantize, swing, accords par nom)
- Instruments : piano, basse, pads, batterie, lead, cordes
- Effets + Inspector + Mixer avec meters
- Save/load `.softdaw.json` (FS Tauri ou téléchargement navigateur)
