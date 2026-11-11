import {
  ENTRY, SERVICE_DOOR, hexDistance,
  type ActionRequest, type MercatumPlayer, type MarketItem,
} from "@mercatum/shared";

export type ActionPlan =
  | { ok:true; duration:number; request:ActionRequest }
  | { ok:false; reason:string };

/** Resolve legality and costs at action start. Completion re-checks location and state. */
export function planAction(
  player:MercatumPlayer, request:unknown, doorOpen:boolean, ground:readonly MarketItem[],
):ActionPlan {
  if(!player.inside)return {ok:false,reason:"El personaje está fuera del Mercado."};
  if(!request||typeof request!=="object"||!("kind" in request))
    return {ok:false,reason:"Acción inválida."};
  const value=request as Record<string,unknown>;
  const kind=value.kind;
  const position={q:player.q,r:player.r};
  if(kind==="open") {
    if(value.method!=="force"&&value.method!=="intellect")return {ok:false,reason:"Método no reconocido."};
    if(doorOpen)return {ok:false,reason:"La puerta ya está abierta."};
    if(hexDistance(position,SERVICE_DOOR)>1)return {ok:false,reason:"Debes acercarte a la puerta."};
    const method=value.method;
    const duration=method==="force"
      ? Math.max(750,2200-400*player.strength)
      : Math.max(750,2600-450*player.intellect);
    return {ok:true,duration,request:{kind:"open",method}};
  }
  if(kind==="extract"){
    if(hexDistance(position,ENTRY)!==0)return {ok:false,reason:"La extracción solo funciona en la entrada."};
    return {ok:true,duration:1200,request:{kind:"extract"}};
  }
  if(kind==="inspect"||kind==="take"){
    if(typeof value.itemId!=="string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(value.itemId))
      return {ok:false,reason:"Identificador de objeto inválido."};
    const item=ground.find(x=>x.id===value.itemId);
    if(!item || item.q===undefined || item.r===undefined || hexDistance(position,{q:item.q,r:item.r})>1)
      return {ok:false,reason:"La mercancía no está al alcance."};
    return {ok:true,duration:kind==="inspect"?650:1100,request:{kind,itemId:value.itemId}};
  }
  return {ok:false,reason:"Acción desconocida."};
}
