import { advanceCreature, nextCreatureDue, type CreatureTick } from "./storage/creatures.js";

/** Event scheduler: no global frame loop, no full-history replay on reboot. */
export class CreatureScheduler {
  private timer: ReturnType<typeof setTimeout>|null=null;
  private running=false;
  private stopped=true;
  constructor(private readonly onTick: (result:CreatureTick)=>Promise<void>){}

  async start():Promise<void>{
    this.stopped=false;
    await this.schedule();
  }
  stop():void{
    this.stopped=true;
    if(this.timer)clearTimeout(this.timer);
    this.timer=null;
  }
  private async schedule():Promise<void>{
    if(this.stopped||this.running)return;
    try{
      const due=await nextCreatureDue();
      if(this.stopped||due===null)return;
      const delay=Math.max(40,Math.min(30_000,due-Date.now()));
      this.timer=setTimeout(()=>void this.tick(),delay);
    }catch(error){
      console.error("[Mercatum] Creature schedule:",error);
      if(!this.stopped)this.timer=setTimeout(()=>void this.schedule(),2000);
    }
  }
  private async tick():Promise<void>{
    if(this.stopped||this.running)return;
    this.running=true;
    try{
      const result=await advanceCreature(Date.now());
      if(result.moved)await this.onTick(result);
    }catch(error){
      console.error("[Mercatum] Creature tick:",error);
      // A DB outage does not cause a busy spin. Positions remain durable.
      await new Promise(resolve=>setTimeout(resolve,1000));
    }finally{
      this.running=false;
      if(!this.stopped)await this.schedule();
    }
  }
}
