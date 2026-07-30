export type InsertionMethod = 'beforeParent' | 'afterParent' | 'firstChild';

export interface ControllerPositioning {
  insertionPoint: HTMLElement;
  insertionMethod: InsertionMethod;
  targetParent: HTMLElement;
}

export interface SiteHandler {
  readonly hostname: string;
  initialize(document: Document): void;
  cleanup(): void;
  getControllerPosition(parent: HTMLElement, video: HTMLMediaElement): ControllerPositioning;
  handleSpeedChange(video: HTMLMediaElement, speed: number): void;
  handleSeek(video: HTMLMediaElement, seekSeconds: number): boolean;
  shouldIgnoreVideo(video: HTMLMediaElement): boolean;
  getVideoContainerSelectors(): string[];
  detectSpecialVideos(document: Document): HTMLMediaElement[];
}

export interface SiteHandlerConstructor {
  new (): SiteHandler;
  matches(): boolean;
}
