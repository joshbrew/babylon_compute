/* 
    esbuild + nodejs development server. 
    Begin your javascript application here. This file serves as a simplified entry point to your app, 
    all other scripts you want to build can stem from here if you don't want to define more entryPoints 
    and an outdir in the bundler settings.

    Just ctrl-A + delete all this to get started on your app.

*/

import './index.css' //compiles with esbuild, just link the stylesheet in your index.html (the boilerplate shows this example)

import * as BABYLON from 'babylonjs'
import * as dat from 'dat.gui';

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

    var scene = new BABYLON.Scene(engine);

    var camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 4, 10, BABYLON.Vector3.Zero(), scene);

    camera.setTarget(BABYLON.Vector3.Zero());

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

    //BASICS

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


    //BOIDS

    const simParams = {
        deltaT: 0.04,
        rule1Distance: 0.1,
        rule2Distance: 0.025,
        rule3Distance: 0.025,
        rule1Scale: 0.02,
        rule2Scale: 0.05,
        rule3Scale: 0.005,
    };

    const gui = getGUI();

    const updateSimParams = () => {
        boid.updateSimParams(simParams);
    };

    Object.keys(simParams).forEach((k) => {
        gui.add(simParams, k).onFinishChange(updateSimParams);
    });

    const boid = new Boid(1500, scene);

    updateSimParams();

    scene.onBeforeRenderObservable.add(() => {
        boid.update();
    });

    return scene;
};

function checkComputeShadersSupported(engine, scene) {
    const supportCS = engine.getCaps().supportComputeShaders;

    if (supportCS) {
        return true;
    }

    var panel = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);

    const textNOk = "**Use WebGPU to watch this demo which requires compute shaders support. To enable WebGPU please use Edge Canary or Chrome canary. Also, select the WebGPU engine from the top right drop down menu.**";

    var info = new BABYLON.GUI.TextBlock();
    info.text = textNOk;
    info.width = "100%";
    info.paddingLeft = "5px";
    info.paddingRight = "5px";
    info.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    info.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    info.color = supportCS ? "green" : "red";
    info.fontSize = supportCS ? "18px" : "24px";
    info.fontStyle = supportCS ? "" : "bold";
    info.textWrapping = true;
    panel.addControl(info); 

    return false;
}

class Boid {

    constructor(numParticles, scene) {
        const engine = scene.getEngine();

        this.numParticles = numParticles;

        // Create boid mesh
        const boidMesh = BABYLON.MeshBuilder.CreatePlane("plane", { size: 1 }, scene);

        this.mesh = boidMesh;

        boidMesh.forcedInstanceCount = numParticles;

        //const mesh = new BABYLON.Mesh("boid", scene);
        //new BABYLON.Geometry(BABYLON.Geometry.RandomId(), scene, null, false, mesh);

        const mat = new BABYLON.ShaderMaterial("mat", scene, { 
            vertexSource: boidVertexShader,
            fragmentSource: boidFragmentShader,
        }, {
            attributes: ["a_pos", "a_particlePos", "a_particleVel"]
        });

        boidMesh.material = mat;

        const buffSpriteVertex = new BABYLON.VertexBuffer(engine, [-0.01, -0.02, 0.01, -0.02, 0.0, 0.02], "a_pos", false, false, 2, false);

        boidMesh.setIndices([0, 1, 2]);
        boidMesh.setVerticesBuffer(buffSpriteVertex);

        // Create uniform / storage / vertex buffers
        this.simParams = new BABYLON.UniformBuffer(engine, undefined, undefined, "simParams");

        this.simParams.addUniform("deltaT", 1);
        this.simParams.addUniform("rule1Distance", 1);
        this.simParams.addUniform("rule2Distance", 1);
        this.simParams.addUniform("rule3Distance", 1);
        this.simParams.addUniform("rule1Scale", 1);
        this.simParams.addUniform("rule2Scale", 1);
        this.simParams.addUniform("rule3Scale", 1);
        this.simParams.addUniform("numParticles", 1);

        const initialParticleData = new Float32Array(numParticles * 4);
        for (let i = 0; i < numParticles; ++i) {
            initialParticleData[4 * i + 0] = 2 * (Math.random() - 0.5);
            initialParticleData[4 * i + 1] = 2 * (Math.random() - 0.5);
            initialParticleData[4 * i + 2] = 2 * (Math.random() - 0.5) * 0.1;
            initialParticleData[4 * i + 3] = 2 * (Math.random() - 0.5) * 0.1;
        }

        this.particleBuffers = [
            new BABYLON.StorageBuffer(engine, initialParticleData.byteLength, BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX | BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE),
            new BABYLON.StorageBuffer(engine, initialParticleData.byteLength, BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX | BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE),
        ];

        this.particleBuffers[0].update(initialParticleData);
        this.particleBuffers[1].update(initialParticleData);

        this.vertexBuffers = [
            [
                new BABYLON.VertexBuffer(engine, this.particleBuffers[0].getBuffer(), "a_particlePos", false, false, 4, true, 0, 2),
                new BABYLON.VertexBuffer(engine, this.particleBuffers[0].getBuffer(), "a_particleVel", false, false, 4, true, 2, 2)
            ],
            [
                new BABYLON.VertexBuffer(engine, this.particleBuffers[1].getBuffer(), "a_particlePos", false, false, 4, true, 0, 2),
                new BABYLON.VertexBuffer(engine, this.particleBuffers[1].getBuffer(), "a_particleVel", false, false, 4, true, 2, 2)
            ]
        ];

        // Create compute shaders
        this.cs1 = new BABYLON.ComputeShader("compute1", engine, { computeSource: boidComputeShader }, {
            bindingsMapping: {
                "params": { group: 0, binding: 0 },
                "particlesA": { group: 0, binding: 1 },
                "particlesB": { group: 0, binding: 2 },
            }
        });
        this.cs1.setUniformBuffer("params", this.simParams);
        this.cs1.setStorageBuffer("particlesA", this.particleBuffers[0]);
        this.cs1.setStorageBuffer("particlesB", this.particleBuffers[1]);

        this.cs2 = new BABYLON.ComputeShader("compute2", engine, { computeSource: boidComputeShader }, {
            bindingsMapping: {
                "params": { group: 0, binding: 0 },
                "particlesA": { group: 0, binding: 1 },
                "particlesB": { group: 0, binding: 2 },
            }
        });
        this.cs2.setUniformBuffer("params", this.simParams);
        this.cs2.setStorageBuffer("particlesA", this.particleBuffers[1]);
        this.cs2.setStorageBuffer("particlesB", this.particleBuffers[0]);

        this.cs = [this.cs1, this.cs2];
        this.t = 0;
    }

    dispose() {
        this.simParams.dispose();
        this.particleBuffers[0].dispose();
        this.particleBuffers[1].dispose();
        this.cs1.dispose();
        this.cs2.dispose();
    }

    updateSimParams(simParams) {
        this.simParams.updateFloat("deltaT", simParams.deltaT);
        this.simParams.updateFloat("rule1Distance", simParams.rule1Distance);
        this.simParams.updateFloat("rule2Distance", simParams.rule2Distance);
        this.simParams.updateFloat("rule3Distance", simParams.rule3Distance);
        this.simParams.updateFloat("rule1Scale", simParams.rule1Scale);
        this.simParams.updateFloat("rule2Scale", simParams.rule2Scale);
        this.simParams.updateFloat("rule3Scale", simParams.rule3Scale);
        this.simParams.updateInt("numParticles", this.numParticles);
        this.simParams.update();
    }

    update() {
        this.cs[this.t].dispatch(Math.ceil(this.numParticles / 64));

        this.mesh.setVerticesBuffer(this.vertexBuffers[this.t][0], false);
        this.mesh.setVerticesBuffer(this.vertexBuffers[this.t][1], false);

        this.t = (this.t + 1) % 2;
    }
}

function getGUI() {
    var oldgui = document.getElementById("datGUI");
    if (oldgui != null) {
        oldgui.remove();
    }

    var gui = new dat.GUI();
    gui.domElement.style.marginTop = "100px";
    gui.domElement.id = "datGUI";

    return gui;
}

const boidVertexShader = `
    attribute vec2 a_pos;
    attribute vec2 a_particlePos;
    attribute vec2 a_particleVel;
    
    void main() {
        float angle = -atan(a_particleVel.x, a_particleVel.y);
        vec2 pos = vec2(
            a_pos.x * cos(angle) - a_pos.y * sin(angle),
            a_pos.x * sin(angle) + a_pos.y * cos(angle)
        );
        gl_Position = vec4(pos + a_particlePos, 0.0, 1.0);
    }
`;

const boidFragmentShader = `
    void main() {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
`;

const boidComputeShader = `
struct Particle {
    pos : vec2<f32>,
    vel : vec2<f32>,
};
struct SimParams {
    deltaT : f32,
    rule1Distance : f32,
    rule2Distance : f32,
    rule3Distance : f32,
    rule1Scale : f32,
    rule2Scale : f32,
    rule3Scale : f32,
    numParticles: u32,
};
struct Particles {
    particles : array<Particle>,
};
@binding(0) @group(0) var<uniform> params : SimParams;
@binding(1) @group(0) var<storage, read> particlesA : Particles;
@binding(2) @group(0) var<storage, read_write> particlesB : Particles;

// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    var index : u32 = GlobalInvocationID.x;

    if (index >= params.numParticles) {
        return;
    }

    var vPos : vec2<f32> = particlesA.particles[index].pos;
    var vVel : vec2<f32> = particlesA.particles[index].vel;
    var cMass : vec2<f32> = vec2<f32>(0.0, 0.0);
    var cVel : vec2<f32> = vec2<f32>(0.0, 0.0);
    var colVel : vec2<f32> = vec2<f32>(0.0, 0.0);
    var cMassCount : u32 = 0u;
    var cVelCount : u32 = 0u;
    var pos : vec2<f32>;
    var vel : vec2<f32>;

    for (var i : u32 = 0u; i < arrayLength(&particlesA.particles); i = i + 1u) {
    if (i == index) {
        continue;
    }

    pos = particlesA.particles[i].pos.xy;
    vel = particlesA.particles[i].vel.xy;
    if (distance(pos, vPos) < params.rule1Distance) {
        cMass = cMass + pos;
        cMassCount = cMassCount + 1u;
    }
    if (distance(pos, vPos) < params.rule2Distance) {
        colVel = colVel - (pos - vPos);
    }
    if (distance(pos, vPos) < params.rule3Distance) {
        cVel = cVel + vel;
        cVelCount = cVelCount + 1u;
    }
    }
    if (cMassCount > 0u) {
    var temp : f32 = f32(cMassCount);
    cMass = (cMass / vec2<f32>(temp, temp)) - vPos;
    }
    if (cVelCount > 0u) {
    var temp : f32 = f32(cVelCount);
    cVel = cVel / vec2<f32>(temp, temp);
    }
    vVel = vVel + (cMass * params.rule1Scale) + (colVel * params.rule2Scale) +
        (cVel * params.rule3Scale);

    // clamp velocity for a more pleasing simulation
    vVel = normalize(vVel) * clamp(length(vVel), 0.0, 0.1);
    // kinematic update
    vPos = vPos + (vVel * params.deltaT);
    // Wrap around boundary
    if (vPos.x < -1.0) {
    vPos.x = 1.0;
    }
    if (vPos.x > 1.0) {
    vPos.x = -1.0;
    }
    if (vPos.y < -1.0) {
    vPos.y = 1.0;
    }
    if (vPos.y > 1.0) {
    vPos.y = -1.0;
    }
    // Write back
    particlesB.particles[index].pos = vPos;
    particlesB.particles[index].vel = vVel;
}
`;




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


