import { WindowRefService } from './../services/window-ref.service';
import {ElementRef, Injectable, NgZone} from '@angular/core';
import {
  Engine,
  FreeCamera,
  Scene,
  Light,
  Mesh,
  Color3,
  Color4,
  Vector3,
  HemisphericLight,
  StandardMaterial,
  Texture,
  DynamicTexture,
  Space,
  ArcRotateCamera,
  Vector4,
  MeshBuilder,
  CSG
} from '@babylonjs/core';

@Injectable({ providedIn: 'root' })
export class EngineService {
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private camera: FreeCamera;
  private scene: Scene;
  private light: Light;

  private sphere: Mesh;

  public constructor(
    private ngZone: NgZone,
    private windowRef: WindowRefService
  ) {}

  /**
   * Convert [x,y] cartesian coordinates to corresponding polar [x,y] coordinates
   */
  private static cartesianToPolar( x:number, y:number ) {
    // iy = 0, always oy=0.5, ox=0.5
    // iy = 1, oy=Math.sin(theta), ox=Math.cos(theta)
    // theta = Math.atan2(x,y)
  
    var rho = y * 0.5;
    var theta = x * 2 * Math.PI;
  
    var ox = 0.5 + Math.cos(theta) * rho;
    var oy = 0.5 + Math.sin(theta) * rho;
  
    return {
      x: ox,
      y: oy
    };
  }

  private static getPixel(x:number, y:number, imgData:ImageData) {
    x = Math.floor(x);
    y = Math.floor(y);
    const i = 4 * (x + y * imgData.width);
    if (x % 100 == 0 && y % 100 == 0) {
      console.log(`4 * (${x} + ${y} * ${imgData.width}) => ${i}`);
    }
    return {
      r:imgData.data[i + 0], 
      g:imgData.data[i + 1], 
      b:imgData.data[i + 2],
      a:imgData.data[i + 3]
    };
  }

  private static setPixel(x:number, y:number, imgData:ImageData, r:number, g:number, b:number, a:number) {
    x = Math.floor(x);
    y = Math.floor(y);
    const i = 4 * (x + y * imgData.width);
    imgData.data[i + 0] = r;
    imgData.data[i + 1] = g;
    imgData.data[i + 2] = b;
    imgData.data[i + 3] = a;
  }

  // TODO:
  // * Graphics improvement
  //   * Add proper inside texture -- probably will need to add the front image to the same output texture and UV map it accordingly for the front / back image
  //   * Add beveled outside bulge (optional)
  //   * Add generic textures for knurled edge (optional)
  //   * Add normal map for 3D effect on the coin surface
  // * Import from Numista
  //   * Read coin image
  //   * Read coin diameter
  //   * Read coin thickness (optional?  Not always present.)
  //   * Track coin image orientation (whether the coin sides are both the same side up ↑↑ or flipped like american coinage ↑↓. That should help us with proper alignment)
  // * GUI controls
  //   * Set punch size
  //   * Set coin download location
  //   * Adjust ring interior size (does this stretch the ring thinner / thicker?)
  //  

  public createScene(canvas: ElementRef<HTMLCanvasElement>): void {
    // Morgan back: https://en.numista.com/catalogue/photos/etats-unis/5ee614ca4780f9.05253990-original.jpg
    // Morgan front: https://en.numista.com/catalogue/photos/etats-unis/5ee614c99912c4.90093382-original.jpg
    // The first step is to get the reference of the canvas element from our HTML document
    // create a basic BJS Scene object
    this.canvas = canvas.nativeElement;

    // Then, load the Babylon 3D engine:
    this.engine = new Engine(this.canvas,  true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 0);
    const camera = new ArcRotateCamera("Camera", Math.PI / 2, Math.PI / 2.5, 4, Vector3.Zero(), this.scene);
    camera.attachControl(this.canvas, true);
    const light = new HemisphericLight("light", new Vector3(1, 1, 0), this.scene);

    //Create dynamic texture
    const DTWidth = 1024;
    const DTHeight = 512;

    var textureInput;
    var textureOutput = new DynamicTexture("dynamic texture", {width:DTWidth, height:DTHeight}, this.scene, true);
    var outputContext = textureOutput.getContext();

    var bumpOutput = new DynamicTexture("dynamic bumpmap", {width:DTWidth, height:DTHeight}, this.scene, true);
    var outputBumpContext = bumpOutput.getContext();

    var materialOutput = new StandardMaterial("Mat", this.scene);
    materialOutput.diffuseTexture = textureOutput;	
    materialOutput.bumpTexture = bumpOutput;
    
    var materialInput = new StandardMaterial("MatInput", this.scene);
    var bumpInput2 = new Texture("assets/textures/MorganDollarBackNormal.png", this.scene);
    materialInput.bumpTexture = bumpInput2;

    var scene = this.scene;
    var img = new Image();
    img.src = 'assets/textures/MorganDollarBack.jpg';


    img.onload = function() {
      console.log("Texture loaded.  Building custom image...");
      let radius = img.width;

      textureInput = new DynamicTexture("dynamic texture input", {width:img.width, height:img.height}, scene, false);
      var inputContext = textureInput.getContext();
      inputContext.drawImage(img, 0,0, img.width, img.height);
      console.log(`Getting input imageData for ${img.width}, ${img.height}`);
      let inData = inputContext.getImageData(0,0,img.width, img.height);

      textureInput.update();
      materialInput.diffuseTexture = textureInput;

      //outputContext.drawImage(img, 0, 0, img.width, img.height, 0, 0, DTHeight, DTHeight);

      console.log("Creating output imageData");
      let outData = outputContext.createImageData(DTWidth, DTHeight);
      console.log(`Loaded imageData for ${inData.data.length} input and ${outData.data.length} output`);

      //Add image to dynamic texture

      const inc = 1;
      console.log(`Input data is ${inData.width}x${inData.height}`);
      for (let x = 0; x < DTWidth; x+= inc) {
          for (let y = 0; y < DTHeight; y += inc) {
              var ix = x / DTWidth;
              var iy = y / DTHeight;
              let coords = EngineService.cartesianToPolar(ix, iy);
              
              var srcPixel = EngineService.getPixel(coords.x * inData.width, coords.y * inData.height, inData);
              if (x % 100 == 0 && y % 100 == 0) {
                console.log(`Input (${ix},${iy}) = (${coords.x},${coords.y}) [(${coords.x* inData.width},${coords.y* inData.height})] : ${srcPixel.r}:${srcPixel.g}:${srcPixel.b}:${srcPixel.a}`);
              }
              EngineService.setPixel(x, y, outData, srcPixel.r, srcPixel.g, srcPixel.b, 255);
          }
      }
      outputContext.putImageData(outData, 0,0);
      textureOutput.update();
    }

    var bumpimg = new Image();
    bumpimg.src = "assets/textures/MorganDollarBackNormal.png";

    bumpimg.onload = function() {
      console.log("Texture loaded.  Building custom image...");
      let radius = bumpimg.width;

      var bumpInput = new DynamicTexture("dynamic texture bump input", {width:bumpimg.width, height:bumpimg.height}, scene, false);
      var inputContext = bumpInput.getContext();
      inputContext.drawImage(bumpimg, 0,0, bumpimg.width, bumpimg.height);
      console.log(`Getting input imageData for ${bumpimg.width}, ${bumpimg.height}`);
      let inData = inputContext.getImageData(0,0,bumpimg.width, bumpimg.height);

      bumpInput.update();

      //outputBumpContext.drawImage(bumpimg, 0, 0, bumpimg.width, bumpimg.height, 0, 0, DTHeight, DTHeight);

      console.log("Creating output imageData");
      let outData = outputBumpContext.createImageData(DTWidth, DTHeight);
      console.log(`Loaded imageData for ${inData.data.length} input and ${outData.data.length} output`);


      //Add image to dynamic texture
      const inc = 1;
      console.log(`Input data is ${inData.width}x${inData.height}`);
      for (let x = 0; x < DTWidth; x+= inc) {
          for (let y = 0; y < DTHeight; y += inc) {
              var ix = x / DTWidth;
              var iy = y / DTHeight;
              let coords = EngineService.cartesianToPolar(ix, iy);
              
              var srcPixel = EngineService.getPixel(coords.x * inData.width, coords.y * inData.height, inData);
              if (x % 100 == 0 && y % 100 == 0) {
                console.log(`Input (${ix},${iy}) = (${coords.x},${coords.y}) [(${coords.x* inData.width},${coords.y* inData.height})] : ${srcPixel.r}:${srcPixel.g}:${srcPixel.b}:${srcPixel.a}`);
              }
              EngineService.setPixel(x, y, outData, srcPixel.r, srcPixel.g, srcPixel.b, 255);
          }
      }
      outputBumpContext.putImageData(outData, 0,0);
      bumpOutput.update();
      
    }

    const faceUV = [];
    faceUV[0] =	new Vector4(0, 0, 0, 0);
    //faceUV[1] =	new Vector4(0, 0, 1, 0.75); // x, z swapped to flip image
    faceUV[1] =	new Vector4(0, 0, 1, 0.75); // x, z swapped to flip image
    faceUV[2] = new Vector4(0, 0, 1, 1);

    this.scene.ambientColor = new Color3(0.3, 0.3, 0.3);
  
    var innerDiameter = 1.8;
    var outerDiameter = 2;
    var height = 1;
    
    var tess = 64;
    
    //var inner = BABYLON.Mesh.CreateCylinder("inner", height, innerDiameter, innerDiameter, tess, 1, scene);
    var inner = MeshBuilder.CreateCylinder("inner", {height:height, diameterTop:innerDiameter, diameterBottom:innerDiameter, faceUV:faceUV, tessellation: tess, subdivisions: 1});
  
    //inner.material = canMaterial;
    //var outer = BABYLON.MeshBuilder.CreateCylinder("outer", height, outerDiameter, outerDiameter, tess, 1, scene);
    var outer = MeshBuilder.CreateCylinder("outer", {height:height, diameterTop:outerDiameter, diameterBottom:outerDiameter, faceUV:faceUV, tessellation: tess, subdivisions: 1});
    outer.material = materialOutput;
  
    var innerCSG = CSG.FromMesh(inner);
    var outerCSG = CSG.FromMesh(outer);
    
    var subCSG = outerCSG.subtract(innerCSG);
    
    var mat0 = new StandardMaterial("mat0", this.scene);
  
    var newMesh = subCSG.toMesh("csg2", materialOutput, this.scene);
  
    var plane = MeshBuilder.CreatePlane("plane", {size:1}, this.scene);
    plane.material = materialInput;
    plane.rotation.x = Math.PI * 0.5;
    
    this.scene.removeMesh(inner);
    this.scene.removeMesh(outer);
    
    newMesh.rotation.y = Math.PI * 0.25;

    //return this.scene;
  };

  public animate(): void {
    // We have to run this outside angular zones,
    // because it could trigger heavy changeDetection cycles.
    this.ngZone.runOutsideAngular(() => {
      const rendererLoopCallback = () => {
        this.scene.render();
      };

      if (this.windowRef.document.readyState !== 'loading') {
        this.engine.runRenderLoop(rendererLoopCallback);
      } else {
        this.windowRef.window.addEventListener('DOMContentLoaded', () => {
          this.engine.runRenderLoop(rendererLoopCallback);
        });
      }

      this.windowRef.window.addEventListener('resize', () => {
        this.engine.resize();
      });
    });
  }

  /**
   * creates the world axes
   *
   * Source: https://doc.babylonjs.com/snippets/world_axes
   *
   * @param size number
   */
  public showWorldAxis(size: number): void {

    const makeTextPlane = (text: string, color: string, textSize: number) => {
      const dynamicTexture = new DynamicTexture('DynamicTexture', 50, this.scene, true);
      dynamicTexture.hasAlpha = true;
      dynamicTexture.drawText(text, 5, 40, 'bold 36px Arial', color , 'transparent', true);
      const plane = Mesh.CreatePlane('TextPlane', textSize, this.scene, true);
      const material = new StandardMaterial('TextPlaneMaterial', this.scene);
      material.backFaceCulling = false;
      material.specularColor = new Color3(0, 0, 0);
      material.diffuseTexture = dynamicTexture;
      plane.material = material;

      return plane;
    };

    const axisX = Mesh.CreateLines(
      'axisX',
      [
        Vector3.Zero(),
        new Vector3(size, 0, 0), new Vector3(size * 0.95, 0.05 * size, 0),
        new Vector3(size, 0, 0), new Vector3(size * 0.95, -0.05 * size, 0)
      ],
      this.scene
    );

    axisX.color = new Color3(1, 0, 0);
    const xChar = makeTextPlane('X', 'red', size / 10);
    xChar.position = new Vector3(0.9 * size, -0.05 * size, 0);

    const axisY = Mesh.CreateLines(
      'axisY',
      [
        Vector3.Zero(), new Vector3(0, size, 0), new Vector3( -0.05 * size, size * 0.95, 0),
        new Vector3(0, size, 0), new Vector3( 0.05 * size, size * 0.95, 0)
      ],
      this.scene
    );

    axisY.color = new Color3(0, 1, 0);
    const yChar = makeTextPlane('Y', 'green', size / 10);
    yChar.position = new Vector3(0, 0.9 * size, -0.05 * size);

    const axisZ = Mesh.CreateLines(
      'axisZ',
      [
        Vector3.Zero(), new Vector3(0, 0, size), new Vector3( 0 , -0.05 * size, size * 0.95),
        new Vector3(0, 0, size), new Vector3( 0, 0.05 * size, size * 0.95)
      ],
      this.scene
    );

    axisZ.color = new Color3(0, 0, 1);
    const zChar = makeTextPlane('Z', 'blue', size / 10);
    zChar.position = new Vector3(0, 0.05 * size, 0.9 * size);
  }
}
