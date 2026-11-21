import { hexDistance, type HexCoordinate } from "@mercatum/shared";
import { hasLineOfSight } from "./creatureLogic.js";

export const CHAT_RADIUS_HEXES = 2;
export const CHAT_MAX_CHARS = 160;
export const CHAT_COOLDOWN_MS = 1_300;
export const CHAT_WINDOW_MS = 12_000;
export const CHAT_WINDOW_LIMIT = 5;
export const CHAT_REPORT_WINDOW_MS = 5 * 60_000;

export interface Speaker {
  readonly phase: "inside" | "outside" | "dead";
  readonly health: number;
  readonly q: number;
  readonly r: number;
}
/** Only live actors sharing an unobstructed nearby room can hear one another.
 * The exterior is intentionally NOT a global audio channel. */
export function chatReachable(a:Speaker,b:Speaker,doorOpen:boolean):boolean {
  if(a.phase!=="inside"||b.phase!=="inside"||a.health<=0||b.health<=0)return false;
  return hexDistance(a as HexCoordinate,b as HexCoordinate)<=CHAT_RADIUS_HEXES
    && hasLineOfSight(a,b,doorOpen);
}
export function parseChatText(input:unknown):string|null {
  if(typeof input!=="string"||input.length>500)return null;
  const normalized=input.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f]/g," ")
    .replace(/\s+/gu," ").trim();
  const length=[...normalized].length;
  if(length===0||length>CHAT_MAX_CHARS)return null;
  return normalized;
}
export class ChatThrottle {
  private readonly history=new Map<string,number[]>();
  allowed(accountId:string,now:number):boolean{
    const recent=(this.history.get(accountId)??[])
      .filter(time=>now-time<CHAT_WINDOW_MS);
    if(recent.length>=CHAT_WINDOW_LIMIT ||
       recent.length>0 && now-recent[recent.length-1]<CHAT_COOLDOWN_MS){
      this.history.set(accountId,recent);
      return false;
    }
    recent.push(now);
    this.history.set(accountId,recent);
    return true;
  }
  forget(accountId:string):void{this.history.delete(accountId);}
}
