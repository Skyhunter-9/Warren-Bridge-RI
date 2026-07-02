import { DecorateContext, Decorator, IModelApp, Marker } from "@itwin/core-frontend";
import { Point3d, XAndY } from "@itwin/core-geometry";

// DEVELOPER REGISTRY: Add or update your hardcoded element Hex IDs right here
export const HARDCODED_SENSORS = [
  "0x2000000027b"
];

export class ElementIconMarker extends Marker {
  public hexId: string;

  constructor(location: Point3d, size: XAndY, hexId: string) {
    super(location, size);
    this.hexId = hexId;
    this.title = `Sensor Node: ${hexId}`;
  }

  // Official vector graphics engine channel
  public override drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.save();
    
    // Draw the bright neon green indicator circle bubble
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, 2 * Math.PI);
    ctx.fillStyle = "#00ff33"; // Vibrant neon green sensor dot color
    ctx.fill();

    // Sharp white ring accent border outline 
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    // Dark outer shadow drop rim for strong contrast against grey bridge girders
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, 2 * Math.PI);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.stroke();

    ctx.restore();
  }

  public override onMouseButton(ev: any): boolean {
    if (ev.isDown) {
      const vp = ev.viewport;
      if (vp) {
        vp.iModel.selectionSet.replace(this.hexId);
      }
    }
    return true;
  }
}

export class IconDecorator implements Decorator {
  private _markers: ElementIconMarker[] = [];

  public addMarker(marker: ElementIconMarker) {
    this._markers.push(marker);
    IModelApp.viewManager.invalidateDecorationsAllViews(); // Force canvas updates
  }

  public clearMarkers() {
    this._markers = [];
    IModelApp.viewManager.invalidateDecorationsAllViews();
  }

  public decorate(context: DecorateContext): void {
    this._markers.forEach((marker) => {
      // Direct pass to native canvas decoration interface
      marker.addDecoration(context);
    });
  }
}
