# Local GenVid Setup with ComfyUI on RTX 4060

This guide walks you through setting up a local AI image/video generation pipeline using ComfyUI on your RTX 4060 (8GB VRAM).

## Table of Contents
1. [Hardware Considerations](#hardware-considerations)
2. [ComfyUI Installation](#comfyui-installation)
3. [Model Downloads](#model-downloads)
4. [Image Generation Setup](#image-generation-setup)
5. [Video Generation Setup](#video-generation-setup)
6. [API Server Setup](#api-server-setup)
7. [Integration with Lovable App](#integration-with-lovable-app)
8. [Optimization Tips](#optimization-tips)

---

## Hardware Considerations

### RTX 4060 Specs
- **VRAM**: 8GB GDDR6
- **CUDA Cores**: 3072
- **Realistic Capabilities**:
  - ✅ SDXL image generation (with optimizations)
  - ✅ FLUX.1-schnell (quantized versions)
  - ⚠️ AnimateDiff (limited, requires aggressive optimization)
  - ❌ Stable Video Diffusion (needs 12GB+ VRAM)

### Recommended Approach
For 8GB VRAM, use a **hybrid approach**:
- **Local**: Image generation (SDXL or quantized FLUX)
- **Cloud**: Video generation (keep using Replicate for Seedance/SVD)

---

## ComfyUI Installation

### Step 1: Install Python
```bash
# Windows - Download Python 3.10.x from python.org
# Make sure to check "Add Python to PATH"

# Verify installation
python --version  # Should show 3.10.x
```

### Step 2: Install Git
```bash
# Windows - Download from git-scm.com
git --version
```

### Step 3: Clone ComfyUI
```bash
# Navigate to where you want to install
cd C:\AI

# Clone the repository
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
```

### Step 4: Create Virtual Environment
```bash
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
```

### Step 5: Install PyTorch with CUDA
```bash
# For RTX 4060 (CUDA 12.1)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

### Step 6: Install ComfyUI Dependencies
```bash
pip install -r requirements.txt
```

### Step 7: First Run
```bash
python main.py

# ComfyUI will start at http://127.0.0.1:8188
```

---

## Model Downloads

### Option A: SDXL (Recommended for 8GB VRAM)

Download these to `ComfyUI/models/checkpoints/`:

1. **SDXL Base** (~6.5GB)
   - [Juggernaut XL](https://civitai.com/models/133005/juggernaut-xl) - Great for photorealism
   - OR [DreamShaper XL](https://civitai.com/models/112902/dreamshaper-xl) - Versatile

2. **SDXL Refiner** (Optional, ~6GB)
   - Only use if you have VRAM to spare

### Option B: FLUX.1 Quantized (Better quality, tighter on VRAM)

Download to `ComfyUI/models/unet/`:

1. **FLUX.1-schnell GGUF** (Quantized)
   ```bash
   # Install GGUF support first
   cd ComfyUI/custom_nodes
   git clone https://github.com/city96/ComfyUI-GGUF
   ```
   
   Download from: [FLUX.1-schnell-Q4_K_S.gguf](https://huggingface.co/city96/FLUX.1-schnell-gguf/tree/main)
   - Q4_K_S: ~5GB, fits in 8GB VRAM
   - Q8_0: ~8GB, might be tight

2. **CLIP Models** (Required for FLUX)
   Download to `ComfyUI/models/clip/`:
   - [clip_l.safetensors](https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main)
   - [t5xxl_fp8_e4m3fn.safetensors](https://huggingface.co/comfyanonymous/flux_text_encoders/tree/main)

3. **VAE** 
   Download to `ComfyUI/models/vae/`:
   - [ae.safetensors](https://huggingface.co/black-forest-labs/FLUX.1-schnell/tree/main)

### For Video Generation (AnimateDiff)

> ⚠️ **Warning**: AnimateDiff is VRAM-intensive. With 8GB, expect lower resolution (512x512) or frame limits.

Download to `ComfyUI/models/animatediff_models/`:
- [mm_sd_v15_v2.ckpt](https://huggingface.co/guoyww/animatediff/tree/main) (~1.8GB)

---

## Image Generation Setup

### Install Required Custom Nodes

```bash
cd ComfyUI/custom_nodes

# ComfyUI Manager (makes installing other nodes easy)
git clone https://github.com/ltdrdata/ComfyUI-Manager

# For FLUX support
git clone https://github.com/city96/ComfyUI-GGUF

# Restart ComfyUI after installing
```

### Basic SDXL Workflow

Create this workflow in ComfyUI (or save as JSON):

```json
{
  "workflow_name": "SDXL_Basic",
  "nodes": [
    "CheckpointLoaderSimple -> KSampler -> VAEDecode -> SaveImage"
  ]
}
```

**Recommended Settings for 8GB VRAM:**
- Resolution: 1024x1024 (SDXL native)
- Steps: 20-30
- CFG: 7
- Sampler: euler_ancestral or dpmpp_2m
- Scheduler: karras

### FLUX.1 Quantized Workflow

Use the GGUF loader node for quantized FLUX models.

---

## Video Generation Setup

### Option 1: AnimateDiff (Local, Limited)

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved
```

**Settings for 8GB VRAM:**
- Base model: SD 1.5 (NOT SDXL - too heavy with AnimateDiff)
- Resolution: 512x512 (max 576x576)
- Frames: 16-24 max
- Motion module: mm_sd_v15_v2

### Option 2: Keep Using Replicate (Recommended)

For video generation, your current Replicate setup with Seedance-1-Lite is actually more practical:
- No VRAM limitations
- Better quality
- Pay-per-use (cost effective for occasional use)

---

## API Server Setup

ComfyUI has a built-in API. Here's how to use it:

### Enable API Mode

```bash
python main.py --listen 0.0.0.0 --port 8188
```

### API Endpoints

```javascript
// Queue a prompt
POST http://127.0.0.1:8188/prompt
{
  "prompt": { /* workflow JSON */ },
  "client_id": "your-client-id"
}

// Get queue status
GET http://127.0.0.1:8188/queue

// Get history
GET http://127.0.0.1:8188/history

// Get generated image
GET http://127.0.0.1:8188/view?filename=ComfyUI_00001_.png
```

### Example: Queue Image Generation

```javascript
const workflow = {
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": Math.floor(Math.random() * 1000000),
      "steps": 20,
      "cfg": 7,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    }
  },
  // ... more nodes
};

const response = await fetch('http://127.0.0.1:8188/prompt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: workflow })
});
```

---

## Integration with Lovable App

### Option A: Direct Browser Connection (Development Only)

Add to your app:

```typescript
// src/lib/comfyui.ts
const COMFYUI_URL = 'http://127.0.0.1:8188';

export async function generateImageLocal(prompt: string) {
  const workflow = buildWorkflow(prompt);
  
  const response = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  });
  
  const { prompt_id } = await response.json();
  
  // Poll for completion
  return pollForResult(prompt_id);
}
```

> ⚠️ **CORS Issue**: ComfyUI doesn't allow cross-origin requests by default. You'll need to:
> 1. Use a browser extension to disable CORS (dev only)
> 2. Or run a local proxy server

### Option B: Local Proxy Server (Recommended)

Create a simple Express server to proxy requests:

```javascript
// local-server/index.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  
  // Forward to ComfyUI
  const response = await fetch('http://127.0.0.1:8188/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: buildWorkflow(prompt) })
  });
  
  // ... handle response and polling
});

app.listen(3001, () => console.log('Proxy running on :3001'));
```

### Option C: Hybrid Mode Toggle

Add a toggle in your app to switch between local and cloud:

```typescript
// In your generateImage function
const useLocal = localStorage.getItem('useLocalGeneration') === 'true';

if (useLocal) {
  return await generateImageLocal(prompt);
} else {
  return await supabase.functions.invoke('generate-image', { body: { prompt } });
}
```

---

## Optimization Tips

### For 8GB VRAM

1. **Enable FP16/BF16**
   ```bash
   python main.py --bf16-unet  # For RTX 4060
   ```

2. **Use Tiled VAE**
   - Install: `ComfyUI-Tiled-VAE` custom node
   - Reduces VRAM usage for decoding

3. **Aggressive Offloading**
   ```bash
   python main.py --lowvram  # Offload to CPU when not in use
   ```

4. **Use Quantized Models**
   - GGUF Q4_K_S models use ~50% less VRAM
   - Minor quality loss, significant VRAM savings

5. **Close Other Applications**
   - Chrome can use 1-2GB of VRAM
   - Close unnecessary apps before generating

### Memory-Efficient Workflow Tips

- Generate at 768x768, upscale after
- Use fewer steps (20 instead of 30)
- Avoid running refiner models
- Use SD 1.5 for AnimateDiff instead of SDXL

---

## Troubleshooting

### "CUDA out of memory"
- Lower resolution
- Use `--lowvram` flag
- Use quantized models
- Close other GPU applications

### "Model not found"
- Check file paths in ComfyUI/models/
- Ensure correct subfolder (checkpoints, unet, clip, vae)

### "Black images"
- VAE might be wrong or missing
- Try different sampler/scheduler

### "ComfyUI won't start"
- Check Python version (3.10.x recommended)
- Reinstall PyTorch with correct CUDA version

---

## Cost Comparison

| Method | Image (1024x1024) | Video (5s) |
|--------|-------------------|------------|
| **Replicate** | ~$0.003 | ~$0.05-0.10 |
| **Local (electricity)** | ~$0.001 | N/A |
| **Local (time)** | 5-15 sec | 2-10 min |

### Recommendation
- **High volume image gen** → Go local
- **Occasional use** → Stick with Replicate
- **Video generation** → Definitely use Replicate

---

## Next Steps

1. Install ComfyUI following this guide
2. Download SDXL or quantized FLUX models
3. Test basic image generation
4. (Optional) Set up local proxy server
5. (Optional) Add hybrid toggle to your app

Need help integrating the local API with your Lovable app? Let me know!
