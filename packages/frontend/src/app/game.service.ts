import { Injectable } from "@angular/core";
import { RPCSession } from "@astronautlabs/webrpc";
import { CardsAgainstService, PlayerSession, Round } from "@cardsagainst/backend";
import { environment } from "src/environments/environment";

@Injectable()
export class GameService {
    constructor() {
        
    }

    session: RPCSession | undefined;
    service: CardsAgainstService | undefined;
    playerSession: PlayerSession;
    ready: Promise<void>;
    round: Round;

    async init() {
        this.ready = new Promise(async (resolve, reject) => {
            this.session = await RPCSession.connect(environment.backend);
            // this.session.loggingEnabled = true;
            // this.session.tag = 'RPC';
            this.service = await this.session.getRemoteService(CardsAgainstService);
            console.log(`Connected!`);
            resolve();
        });
    }
}