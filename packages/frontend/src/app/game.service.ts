import { Injectable } from "@angular/core";
import { RPCSession } from "@astronautlabs/webrpc";
import { CardsAgainstService, PlayerSession, Round, Session } from "@cardsagainst/backend";
import { environment } from "src/environments/environment";

@Injectable()
export class GameService {
    constructor() {
        
    }

    rpc: RPCSession | undefined;
    cardsAgainst: CardsAgainstService | undefined;
    session: Session;
    playerSession: PlayerSession;
    ready: Promise<void>;
    round: Round;

    get playerId() {
        return localStorage['ca:playerId'];
    }

    async init() {
        this.ready = new Promise(async (resolve, reject) => {
            this.rpc = await RPCSession.connect(environment.backend);
            window['rpc'] = this.rpc;

            // this.session.loggingEnabled = true;
            // this.session.tag = 'RPC';
            this.cardsAgainst = await this.rpc.getRemoteService(CardsAgainstService);
            console.log(`Connected!`);
            resolve();
        });
    }
}