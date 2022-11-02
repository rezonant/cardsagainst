import { Component } from "@angular/core";
import { MatCheckboxChange } from "@angular/material/checkbox";
import { MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Deck, GameRules } from "@cardsagainst/backend";
import { GameService } from "../game.service";

@Component({
    templateUrl: `./settings.component.html`,
    styleUrls: [`./settings.component.scss`]
})
export class SettingsComponent {
    constructor(
        readonly game: GameService,
        readonly matDialogRef: MatDialogRef<SettingsComponent>,
        readonly matSnackBar: MatSnackBar
    ) {
    }

    loading = true;

    async ngOnInit() {
        this.decks = await this.game.cardsAgainst.getDecks();
        this.enabledDecks = await this.game.session.getEnabledDecks();
        this.gameRules = await this.game.session.getGameRules();

        console.log(`Game rules:`);
        console.dir(this.gameRules);
        console.log(`Available decks:`);
        console.dir(this.decks);
        console.log(`Enabled decks:`);
        console.dir(this.enabledDecks);
        this.loading = false;
    }

    decks: Deck[];
    enabledDecks: Deck[];
    gameRules: GameRules;

    get isHost() {
        return this.game.round.host.id === this.game.playerId;
    }

    isDeckEnabled(deck: Deck) {
        return this.enabledDecks.some(x => x.id === deck.id);
    }

    enableDeck(deck: Deck, enabled: boolean) {
        if (enabled === this.isDeckEnabled(deck)) {
            console.log(`Deck ${deck.name} is already ${enabled ? 'enabled' : 'disabled'}`);
            return;
        }
        
        console.log(`${enabled ? 'Enabling' : 'Disabling'} deck ${deck.name}`);

        if (enabled)
            this.enabledDecks.push(deck);
        else if (!enabled)
            this.enabledDecks = this.enabledDecks.filter(x => x.id !== deck.id);
    }

    async save() {
        console.log(`Enabling decks:`);
        console.dir(this.enabledDecks);
        try {
            await this.game.playerSession.setEnabledDecks(this.enabledDecks);
        } catch (e) {
            console.error(`Failed to enable decks:`);
            console.error(e);
            alert(e.message);
            return;
        }

        this.matDialogRef.close();
        this.matSnackBar.open(`Game settings have been updated.`, undefined, {
            duration: 3000
        });
    }

    get filteredDecks() {
        if (!this.deckSearch)
            return this.decks;
        return this.decks.filter(x => x.name.toLowerCase().includes(this.deckSearch.toLowerCase()));
    }

    deckSearch: string;

    enableAllDecks() {
        this.enabledDecks = this.decks.slice();
    }

    disableAllDecks() {
        this.enabledDecks = [];
    }
}