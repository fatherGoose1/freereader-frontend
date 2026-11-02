declare module "jscanify/client" {
  export default class Scanner {
    findPaperContour(image: unknown): { delete: () => void } | null;
    getCornerPoints(contour: unknown): Record<"topLeftCorner" | "topRightCorner" | "bottomLeftCorner" | "bottomRightCorner", { x: number; y: number } | undefined>;
    extractPaper(image: HTMLCanvasElement, width: number, height: number, corners?: Record<string, { x: number; y: number }>): HTMLCanvasElement | null;
  }
}
