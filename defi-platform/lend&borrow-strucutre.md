Ganz simpel erklärt, läuft das so ab:

Setup/Proxy (Unitroller)

Der „Unitroller“ ist ein Proxy, der alle Aufrufe an die richtige Controller-Implementation weiterleitet.

Du brauchst im Frontend nur die Proxy-Adresse (0xa41D5…4445) und rufst Funktionen direkt darauf auf – z. B. getAllMarkets() oder später „mint“.

Market-Logik (PeridottrollerG7)

Die Implementation enthält alle Regeln:

Wer darf mint (einzahlen)?

Was passiert beim borrow (ausleihen)?

Wie wird die Liquidität (getAccountLiquidity) berechnet?

Dein ABI-Snippet enthält die wichtigsten Methoden, um zu prüfen, ob eine Aktion erlaubt ist und um sie auszuführen.

pToken-Proxies (für jedes Asset)

Für jedes Underlying-Token (USDC, WBTC, …) gibt es einen eigenen pToken-Contract (Proxy).

Dort rufst du im Frontend zum Beispiel mint(amount) auf, um deine Underlyings einzuzahlen und im Gegenzug pTokens zu erhalten.

Für Rücktausch nimmst du redeem(amount) oder redeemUnderlying(amount).

Interaktion im Frontend

Approve: Erlaube erst dem pToken-Contract, deine Underlyings zu ziehen.

Deposit (mint): Rufe mint(menge) auf – der Proxy leitet intern an mintAllowed und mintVerify in der Controller-Logic weiter.

Withdraw (redeem): Rufe redeem(menge) auf, um Underlying zurückzubekommen.

Borrow: Rufe borrow(menge) auf, um dir Liquidität zu leihen (z. B. USDC gegen deine pTokens als Sicherheit).

Repay: Rufe repayBorrow(menge) auf, um dein Darlehen zurückzuzahlen.

Zinsmodell & APY

Das JumpRateModel berechnet mit getSupplyRate(...) und getBorrowRate(...), wie hoch die Zinsen momentan sind.

Dein Frontend kann diese Raten abrufen, in APY umrechnen und dem Nutzer anzeigen.

Kurz gesagt:

Proxy → du sprichst immer die Proxy-Adresse an.

Controller → hinter den Kulissen werden die Regeln geprüft/angewendet.

pToken-Proxy → hier führst du mint/redeem/borrow/repay aus.

Zinsmodell → hier liest du die aktuellen Zinssätze aus.

So hat dein Frontend alle nötigen Bausteine, um Einzahlen, Auszahlen, Verleihen/Ausleihen und die APY-Anzeige vollständig abzubilden.