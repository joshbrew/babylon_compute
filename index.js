/* 
    esbuild + nodejs development server. 
    Begin your javascript application here. This file serves as a simplified entry point to your app, 
    all other scripts you want to build can stem from here if you don't want to define more entryPoints 
    and an outdir in the bundler settings.

    Just ctrl-A + delete all this to get started on your app.

*/

import './index.css' //compiles with esbuild, just link the stylesheet in your index.html (the boilerplate shows this example)

import * as BABYLON from 'babylonjs'
import * as GUI from '@babylonjs/gui'


let canvas = document.createElement('canvas');
canvas.width = 800;
canvas.height = 600;
canvas.style.width = '100%';
canvas.style.height = '100%';


const engine = new BABYLON.WebGPUEngine(canvas);
engine.initAsync()

document.body.appendChild(canvas);

var createScene = async function () {

    await engine.initAsync()

    // This creates a basic Babylon Scene object (non-mesh)
    var scene = new BABYLON.Scene(engine);

    // This creates and positions a free camera (non-mesh)
    var camera = new BABYLON.FreeCamera("camera1", new BABYLON.Vector3(0, 5, -10), scene);

    // This targets the camera to scene origin
    camera.setTarget(BABYLON.Vector3.Zero());

    // This attaches the camera to the canvas
    camera.attachControl(canvas, true);

    // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
    var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

    // Default intensity is 1. Let's dim the light a small amount
    light.intensity = 0.7;

    // Our built-in 'sphere' shape.
    var sphere = BABYLON.MeshBuilder.CreateSphere("sphere", { diameter: 2, segments: 32 }, scene);

    // Move the sphere upward 1/2 its height
    sphere.position.y = 1;

    // Our built-in 'ground' shape.
    var ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 6, height: 6 }, scene);

    if (!checkComputeShadersSupported(engine, scene)) {
        return scene;
    }

    // -------- COMPUTE 1 -------------------------
    //
    const cs1 = new BABYLON.ComputeShader("myCompute", engine, { computeSource: copyTextureComputeShader }, { bindingsMapping:
        {
            "dest": { group: 0, binding: 0 },
            "src": { group: 0, binding: 2 }
        }
    });

    const src = new BABYLON.Texture("textures/ground.jpg", scene);
    const dest = BABYLON.RawTexture.CreateRGBAStorageTexture(null, 512, 512, scene, false, false);

    cs1.setTexture("src", src);
    cs1.setStorageTexture("dest", dest);

    cs1.dispatchWhenReady(dest.getSize().width, dest.getSize().height, 1).then(() => {
        dest.readPixels().then((data) => {
            //console.log(data);
        });
    });

    const mat = new BABYLON.StandardMaterial("mat", scene);
    mat.diffuseTexture = dest;

    ground.material = mat;

    // -------- COMPUTE 2 -------------------------
    //
    const cs2 = new BABYLON.ComputeShader("myCompute2", engine, { computeSource: clearTextureComputeShader }, { bindingsMapping:
        {
            "tbuf": { group: 0, binding: 0 },
            "params": { group: 0, binding: 1 }
        }
    });

    const dest2 = BABYLON.RawTexture.CreateRGBAStorageTexture(null, 512, 512, scene, false, false);

    const uBuffer = new BABYLON.UniformBuffer(engine);

    uBuffer.updateColor4("color", new BABYLON.Color3(1, 0.6, 0.8), 1);
    uBuffer.update();

    cs2.setStorageTexture("tbuf", dest2);
    cs2.setUniformBuffer("params", uBuffer);

    cs2.dispatchWhenReady(dest2.getSize().width, dest2.getSize().height, 1);

    const mat2 = new BABYLON.StandardMaterial("mat2", scene);
    mat2.diffuseTexture = dest2;

    sphere.material = mat2;

    // -------- COMPUTE 3 -------------------------
    //
    const cs3 = new BABYLON.ComputeShader("myCompute3", engine, { computeSource: matrixMulComputeShader }, { bindingsMapping:
        {
            "firstMatrix": { group: 0, binding: 0 },
            "secondMatrix": { group: 0, binding: 1 },
            "resultMatrix": { group: 0, binding: 2 }
        }
    });

    const firstMatrix = new Float32Array([
        2 /* rows */, 4 /* columns */,
        1, 2, 3, 4,
        5, 6, 7, 8
    ]);

    const bufferFirstMatrix = new BABYLON.StorageBuffer(engine, firstMatrix.byteLength);
    bufferFirstMatrix.update(firstMatrix);

    const secondMatrix = new Float32Array([
        4 /* rows */, 2 /* columns */,
        1, 2,
        3, 4,
        5, 6,
        7, 8
    ]);

    const bufferSecondMatrix = new BABYLON.StorageBuffer(engine, secondMatrix.byteLength);
    bufferSecondMatrix.update(secondMatrix);

    const bufferResultMatrix = new BABYLON.StorageBuffer(engine, Float32Array.BYTES_PER_ELEMENT * (2 + firstMatrix[0] * secondMatrix[1]));

    cs3.setStorageBuffer("firstMatrix", bufferFirstMatrix);
    cs3.setStorageBuffer("secondMatrix", bufferSecondMatrix);
    cs3.setStorageBuffer("resultMatrix", bufferResultMatrix);

    cs3.dispatchWhenReady(firstMatrix[0], secondMatrix[1]).then(() => {
        bufferResultMatrix.read().then((res) => {
            // we know the result buffer contains floats
            const resFloats = new Float32Array(res.buffer);
            console.log(resFloats);
        });
    });

    return scene;
};

function checkComputeShadersSupported(engine, scene) {
    const supportCS = engine.getCaps().supportComputeShaders;

    if (supportCS) {
        return true;
    }

    var panel = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);

    const textNOk = "**Use WebGPU to watch this demo which requires compute shaders support. To enable WebGPU please use Edge Canary or Chrome canary. Also, select the WebGPU engine from the top right drop down menu.**";

    var info = new GUI.TextBlock();
    info.text = textNOk;
    info.width = "100%";
    info.paddingLeft = "5px";
    info.paddingRight = "5px";
    info.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    info.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    info.color = supportCS ? "green" : "red";
    info.fontSize = supportCS ? "18px" : "24px";
    info.fontStyle = supportCS ? "" : "bold";
    info.textWrapping = true;
    panel.addControl(info); 

    return false;
}

const clearTextureComputeShader = `
    @group(0) @binding(0) var tbuf : texture_storage_2d<rgba8unorm,write>;

    struct Params {
        color : vec4<f32>
    };
    @group(0) @binding(1) var<uniform> params : Params;

    @compute @workgroup_size(1, 1, 1)

    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        textureStore(tbuf, vec2<i32>(global_id.xy), params.color);
    }
`;

const copyTextureComputeShader = `
    @group(0) @binding(0) var dest : texture_storage_2d<rgba8unorm,write>;
    @group(0) @binding(1) var samplerSrc : sampler;
    @group(0) @binding(2) var src : texture_2d<f32>;

    @compute @workgroup_size(1, 1, 1)

    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
        let dims : vec2<f32> = vec2<f32>(textureDimensions(src, 0));
        let pix : vec4<f32> = textureSampleLevel(src, samplerSrc, vec2<f32>(global_id.xy) / dims, 0.0);
        textureStore(dest, vec2<i32>(global_id.xy), pix);
    }
`;

const matrixMulComputeShader = `
    struct Matrix {
      size : vec2<f32>,
      numbers: array<f32>,
    };

    @group(0) @binding(0) var<storage,read_write> firstMatrix : Matrix;
    @group(0) @binding(1) var<storage,read_write> secondMatrix : Matrix;
    @group(0) @binding(2) var<storage,read_write> resultMatrix : Matrix;

    @compute @workgroup_size(1, 1, 1)
    fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
      resultMatrix.size = vec2<f32>(firstMatrix.size.x, secondMatrix.size.y);

      let resultCell : vec2<u32> = vec2<u32>(global_id.x, global_id.y);
      var result : f32 = 0.0;
      for (var i : u32 = 0u; i < u32(firstMatrix.size.y); i = i + 1u) {
        let a : u32 = i + resultCell.x * u32(firstMatrix.size.y);
        let b : u32 = resultCell.y + i * u32(secondMatrix.size.y);
        result = result + firstMatrix.numbers[a] * secondMatrix.numbers[b];
      }

      let index : u32 = resultCell.y + resultCell.x * u32(secondMatrix.size.y);
      resultMatrix.numbers[index] = result;
    }
`;



createScene().then((scene) => {

    let div = document.createElement('span');
    div.style.position = 'absolute';
    div.style.left = '20px'
    div.style.color = 'white';
    div.style.fontSize = '20px';
    div.style.zIndex = '10';
    document.body.appendChild(div);

    
    engine.runRenderLoop(function(){
        scene.render();
        div.innerText = engine.getFps().toFixed() + " fps";
    });
    
    // the canvas/window resize event handler
    window.addEventListener('resize', function(){
        engine.resize();
    });
    
    setTimeout(()=>{
        engine.resize();
    },0.1);

});


