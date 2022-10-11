import { Component } from "@angular/core";
import { Router } from "@angular/router";
import { GameService } from "../game.service";
import { v4 as uuid } from 'uuid';

@Component({
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss']
})
export class HomeComponent {
    constructor(
        private game: GameService,
        private router: Router
    ) {

    }
    async startGame() {
        let session = await this.game.service.createSession();
        let gameId = await session.getId();
    
        console.log(`Created game ${gameId} successfully.`);
        this.router.navigateByUrl(`/game/${gameId}`);
      }
}