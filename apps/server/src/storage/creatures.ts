import {
  type CreatureClash, type CreatureKind, type CreatureSighting, type HarmReport,
} from "@mercatum/shared";
import { pool, transaction } from "./db.js";
import {
  canDealContactDamage, chooseCreatureRival, clashDamage, creatureAttackCooldownMs,
  creatureDelayMs, decideCreatureMove, postHitRecoveryMs, woundDamage, type CreatureMind,
  type Prey,
} from "../domain/creatureLogic.js";

type CreatureRow = {
  id: string; kind: CreatureKind; name: string; q: number; r: number;
  next_action_at: string; next_attack_at:string; next_harm_at:string;
  health:number;previous_q:number|null;previous_r:number|null;steps: number;
  last_known_q: number|null; last_known_r: number|null; search_left: number;
};
type PlayerRow = {
  id: string; q: number; r: number; health: number; wounds: number;
  stats: {endurance: number}; phase: string;
  protected_until:string; next_harm_at:string;
};
export interface CreatureAttack {
  characterId: string;
  report: HarmReport;
}
export interface CreatureTick {
  moved: boolean;
  attacks: CreatureAttack[];
  clashes: CreatureClash[];
  groundChanged: boolean;
}

export async function nextCreatureDue(): Promise<number | null> {
  const r=await pool.query<{next_at:string|null}>(`
    SELECT MIN(next_action_at)::text AS next_at FROM creatures WHERE health>0
  `);
  return r.rows[0]?.next_at===null || r.rows[0]?.next_at===undefined
    ? null : Number(r.rows[0].next_at);
}

/** The only source of creature positions; NEVER mirror this into the shared Schema. */
export async function creaturePositions(): Promise<CreatureSighting[]> {
  const r=await pool.query<CreatureRow>(
    "SELECT id,kind,name,q,r,health FROM creatures WHERE health>0 ORDER BY id",
  );
  return r.rows.map(x=>({
    id:x.id,kind:x.kind,name:x.name,q:x.q,r:x.r,health:x.health,maxHealth:120,
  }));
}

/** One creature, at most one step per due event. Delays do not cause catch-up bursts. */
export async function advanceCreature(now:number): Promise<CreatureTick> {
  const smoke=process.env.MERCATUM_CREATURE_SMOKE_FAST==="1" && process.env.NODE_ENV!=="production";
  return transaction(async db=>{
    // Lock ALL living creatures in stable order before choosing a due one.
    // Competing schedulers cannot independently enter the same hex, and the
    // partial unique index is a final database-level safeguard.
    const found=await db.query<CreatureRow>(`
      SELECT * FROM creatures WHERE health>0 ORDER BY id FOR UPDATE
    `);
    const creature=found.rows
      .filter(row=>Number(row.next_action_at)<=now)
      .sort((a,b)=>Number(a.next_action_at)-Number(b.next_action_at)||a.id.localeCompare(b.id))[0];
    if(!creature)return {moved:false,attacks:[],clashes:[],groundChanged:false};
    const rivals=found.rows.filter(x=>x.id!==creature.id);

    const door=await db.query<{door_open:boolean}>(
      "SELECT door_open FROM world_state WHERE id=1",
    );
    const doorOpen=door.rows[0]?.door_open??false;
    const prey=await db.query<Prey>(`
      SELECT id,q,r FROM characters
      WHERE phase='inside' AND health>0 AND protected_until<=$1
    `,[now]);
    const mind:CreatureMind={
      id:creature.id,kind:creature.kind,q:creature.q,r:creature.r,
      steps:creature.steps,lastKnownQ:creature.last_known_q,
      lastKnownR:creature.last_known_r,searchLeft:creature.search_left,
    };
    // Attack an adjacent rival when an opportunity arises. It is NOT a
    // collision: enemies strike from their own hex, and never overlap.
    const target=chooseCreatureRival(mind,rivals,now,Number(creature.next_attack_at));
    if(target){
      const defender=rivals.find(row=>row.id===target.id);
      if(defender && now>=Number(defender.next_harm_at)){
        const damage=clashDamage(creature.kind);
        const remaining=Math.max(0,defender.health-damage);
        const defeated=remaining===0;
        await db.query(`
          UPDATE creatures SET health=$2,next_harm_at=$3 WHERE id=$1
        `,[defender.id,remaining,now+(smoke?180:3000)]);
        await db.query(`
          UPDATE creatures SET next_action_at=$2,next_attack_at=$3,steps=steps+1
          WHERE id=$1
        `,[creature.id,
          now+creatureDelayMs(creature.kind,smoke),
          now+creatureAttackCooldownMs(creature.kind,smoke)]);
        const clash:CreatureClash={
          attackerName:creature.name,defenderName:defender.name,
          damage,defenderHealth:remaining,defeated,q:defender.q,r:defender.r,
        };
        await db.query(`
          INSERT INTO event_log(kind,payload) VALUES('creature_clash',$1)
        `,[JSON.stringify({attackerId:creature.id,defenderId:defender.id,...clash})]);
        let groundChanged=false;
        if(defeated){
          // A defeated scavenger drops stolen items; nothing is duplicated.
          const dropped=await db.query(`
            UPDATE market_objects SET state='ground',creature_id=NULL,
              q=$2,r=$3,condition=GREATEST(0,condition-5)
            WHERE creature_id=$1 AND state='stolen'
          `,[defender.id,defender.q,defender.r]);
          groundChanged=(dropped.rowCount??0)>0;
        }
        return {moved:true,attacks:[],clashes:[clash],groundChanged};
      }
    }
    const decision=decideCreatureMove(mind,prey.rows,doorOpen,rivals,
      creature.previous_q===null||creature.previous_r===null ? null :
        {q:creature.previous_q,r:creature.previous_r});
    const {q,r}=decision.to;
    await db.query(`
      UPDATE creatures SET q=$2,r=$3,next_action_at=$4,steps=steps+1,
        last_known_q=$5,last_known_r=$6,search_left=$7,
        previous_q=$8,previous_r=$9 WHERE id=$1
    `,[
      creature.id,q,r,now+creatureDelayMs(creature.kind,smoke),
      decision.lastKnownQ,decision.lastKnownR,decision.searchLeft,
      creature.q,creature.r,
    ]);

    let groundChanged=false;
    // The scavenger periodically abandons its stolen merchandise. The item
    // remains a unique object and can be recovered from the floor.
    if(creature.kind==="scavenger" && (creature.steps+1)%8===0){
      const dropped=await db.query(`
        UPDATE market_objects SET state='ground',creature_id=NULL,
          q=$2,r=$3,condition=GREATEST(0,condition-5)
        WHERE creature_id=$1 AND state='stolen'
      `,[creature.id,q,r]);
      groundChanged=(dropped.rowCount??0)>0;
    }

    const attacks:CreatureAttack[]=[];
    if(decision.victimId){
      const victims=await db.query<PlayerRow>(`
        SELECT id,q,r,health,wounds,stats,phase,protected_until,next_harm_at
        FROM characters WHERE id=$1 FOR UPDATE
      `,[decision.victimId]);
      const victim=victims.rows[0];
      if(victim && victim.phase==="inside" && victim.health>0 &&
        victim.q===q && victim.r===r &&
        canDealContactDamage(victim,now,
          Number(creature.next_attack_at),Number(victim.next_harm_at),
          Number(victim.protected_until))){
        const damage=woundDamage(creature.kind,Number(victim.stats.endurance??1));
        const health=Math.max(0,victim.health-damage);
        const wounds=Math.min(5,victim.wounds+1);
        const dead=health===0;
        await db.query(`
          UPDATE characters SET health=$2,wounds=$3,phase=$4,next_harm_at=$5
          WHERE id=$1
        `,[victim.id,health,wounds,dead?"dead":"inside",now+postHitRecoveryMs(smoke)]);
        await db.query(`
          UPDATE creatures SET next_attack_at=$2 WHERE id=$1
        `,[creature.id,now+creatureAttackCooldownMs(creature.kind,smoke)]);
        let stolenItem:string|undefined;
        if(dead){
          // Loot is never duplicated: previously carried items return to
          // the exact hex where death was registered. Exterior stash remains.
          const corpse=await db.query(`
            UPDATE market_objects SET state='ground',owner_character_id=NULL,
              q=$2,r=$3 WHERE owner_character_id=$1 AND state='carried'
          `,[victim.id,q,r]);
          groundChanged=groundChanged||(corpse.rowCount??0)>0;
          await db.query(`
            INSERT INTO event_log(kind,character_id,payload)
            VALUES('permadeath',$1,$2)
          `,[victim.id,JSON.stringify({creature:creature.id,q,r})]);
        }else if(creature.kind==="scavenger"){
          const snatched=await db.query<{id:string;label:string}>(`
            SELECT id,label FROM market_objects
            WHERE owner_character_id=$1 AND state='carried' ORDER BY id LIMIT 1 FOR UPDATE
          `,[victim.id]);
          if(snatched.rows[0]){
            const item=snatched.rows[0];
            await db.query(`
              UPDATE market_objects SET state='stolen',owner_character_id=NULL,
                creature_id=$2,q=NULL,r=NULL WHERE id=$1
            `,[item.id,creature.id]);
            stolenItem=item.label;
            await db.query(`
              INSERT INTO event_log(kind,character_id,object_id,payload)
              VALUES('creature_theft',$1,$2,$3)
            `,[victim.id,item.id,JSON.stringify({creature:creature.id})]);
          }
        }
        await db.query(`
          INSERT INTO event_log(kind,character_id,payload)
          VALUES('creature_attack',$1,$2)
        `,[victim.id,JSON.stringify({creature:creature.id,damage,health,wounds})]);
        const message=dead
          ? "El cuerpo no respondió. Expediente cerrado: fallecimiento definitivo."
          : creature.kind==="stalker"
            ? "Una entidad te ha alcanzado. Hay heridas y sangre."
            : "Algo te ha golpeado mientras rebuscaba entre tus pertenencias.";
        attacks.push({characterId:victim.id,report:{
          damage,health,wounds,dead,message, ...(stolenItem?{stolenItem}:{}),
        }});
      }
    }
    return {moved:true,attacks,clashes:[],groundChanged};
  });
}
