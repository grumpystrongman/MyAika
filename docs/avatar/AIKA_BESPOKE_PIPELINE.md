# AIKA Bespoke 3D Pipeline

This pipeline builds the current `AIKA Nocturne (3D)` model programmatically from the rigged Avaturn base.

## Source
- Rigged base GLB: `apps/web/public/assets/aika/3d/alternates/avaturn.glb`
- Reference image: `data/simli-upload/aika-nocturne/AIKA_Nocturne_Simli_Upload_Primary.png`
- Extracted source textures: `data/avatar-pipeline/avaturn-source-images/`

## Output
- Bespoke GLB: `apps/web/public/assets/aika/3d/bespoke/nocturne-bespoke.glb`
- Generated textures: `data/avatar-pipeline/nocturne-bespoke/textures/`
- Blender preview render: `data/avatar-pipeline/nocturne-bespoke/renders/nocturne-bespoke-preview.png`

## Build command
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\avatar_pipeline\run_nocturne_bespoke_pipeline.ps1
```

## Pipeline stages
1. `generate_nocturne_textures.py`
   - derives a dark-glam palette from the reference image
   - repaints head/body/hair/outfit/shoe basecolor textures
2. `build_nocturne_bespoke_blender.py`
   - imports the rigged Avaturn GLB in Blender CLI
   - swaps in the generated textures
   - reshapes bust and upper-torso silhouette
   - opens the neckline by deleting center-front outfit faces
   - adjusts hair volume and exports a new GLB
3. `run_nocturne_bespoke_pipeline.ps1`
   - orchestrates texture generation and Blender export

## Live app wiring
- The homepage `aika_nocturne_3d` model points to:
  - `/assets/aika/3d/bespoke/nocturne-bespoke.glb?v=20260415b`
- Old saved `aika_nocturne_avaturn` selections are migrated back to `aika_nocturne_3d` on page load.

## QA artifacts
- `output/playwright/myaika-bespoke-home-migrated.png`
- `output/playwright/myaika-bespoke-qa-migrated.json`
- `output/playwright/myaika-bespoke-chat-smoke.png`
- `output/playwright/myaika-bespoke-chat-smoke.json`

## External Lenore Ingest
If you obtain the Fab/Sketchfab `Lenore` package locally, place the downloaded zip or extracted files in:
- `data/avatar-pipeline/external/lenore-source/`

Then run:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\avatar_pipeline\ingest_lenore_external.ps1
```

The ingest script will:
- expand any zip archives
- prefer `.glb` when present
- otherwise import `.fbx` or `.blend` through Blender CLI
- output the live model to:
  - `apps/web/public/assets/aika/3d/external/lenore.glb`

If that file exists, `aika_nocturne_3d` automatically switches to Lenore on the live site.
