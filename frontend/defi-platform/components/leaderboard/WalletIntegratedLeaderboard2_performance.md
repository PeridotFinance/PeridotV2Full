# WalletIntegratedLeaderboard2: Wichtigste Performance-Baustellen

Diese Liste fasst die drei größten aktuellen Performance-Bremsen zusammen, die beim Aufenthalt der Nutzer:innen auf dem Leaderboard auftreten. Für jede Baustelle steht eine Kategorie, das beobachtete Verhalten sowie der jeweils kleinste Code-Eingriff, der bereits einen deutlichen Gewinn bringt.

## 1. Komponenten-Hoisting (Kategorie: Render-Zyklen)
- **Problem:** `TxDetailBody`, `PointsBreakdown` und `SharePreview2` werden innerhalb von `WalletIntegratedLeaderboard2` neu definiert. Bei jedem Render erhält React dadurch einen neuen Komponenten-Typ, was zum kompletten Unmount/Mount der Unterbäume führt. Das triggert u. a. erneute `fetch`-Aufrufe und das komplette Redraw der Canvas-Preview, selbst wenn sich an den Props nichts geändert hat.【F:defi-platform/components/leaderboard/WalletIntegratedLeaderboard2.tsx†L498-L620】【F:defi-platform/components/leaderboard/WalletIntegratedLeaderboard2.tsx†L814-L964】
- **Auswirkung:** 20 `PointsBreakdown`-Instanzen verlieren auf jedem Render ihren lokalen State (z. B. `open`), wodurch Popover-Animationen ruckeln und Breakdown-Daten ständig neu geladen werden. Die Canvas in `SharePreview2` wird ebenfalls jedes Mal neu aufgebaut.
- **Minimaländerung:** Funktionen einmalig außerhalb von `WalletIntegratedLeaderboard2` deklarieren oder mit `const Foo = memo(function Foo(){…})` definieren und dann innerhalb der Hauptkomponente verwenden. Dadurch bleibt die Komponentenidentität stabil und unnötige Re-Renders entfallen.

## 2. Periodenwechsel ohne Guard (Kategorie: State-Management)
- **Problem:** `handlePeriodChange` löst unabhängig vom aktuellen Zustand immer ein `setPeriod` und einen neuen `loadAggregate`-Fetch aus. Auch ein Klick auf den bereits aktiven Zeitraum fährt damit die gesamte Loading-Pipeline hoch (Spinner, Skeletons, API-Call).【F:defi-platform/components/leaderboard/WalletIntegratedLeaderboard2.tsx†L366-L386】
- **Auswirkung:** Nutzer:innen, die mehrfach auf dieselbe Tab-Schaltfläche tippen, sehen wiederholt die Ladeanimation und spüren spürbare Lags, obwohl keine neuen Daten erforderlich sind.
- **Minimaländerung:** Am Anfang von `handlePeriodChange` `if (p === period) return;` hinzufügen. Das verhindert überflüssige State-Änderungen und Fetches vollständig.

## 3. Ladezustand trotz Cache erzwingen (Kategorie: Netzwerk/Concurrency)
- **Problem:** `loadAggregate` setzt immer `setLoading(true)` und `setUserLoading(true)`, auch wenn die gewünschten Daten bereits im lokalen Cache (`aggregateCacheRef`) liegen oder gerade ein identischer Request läuft. Mehrere schnelle Wechsel bzw. `peridot:rewards-updated`-Events führen so zu flackernden Skeletons und konkurrierenden Responses, die den letzten Stand überschreiben können.【F:defi-platform/components/leaderboard/WalletIntegratedLeaderboard2.tsx†L244-L386】【F:defi-platform/components/leaderboard/WalletIntegratedLeaderboard2.tsx†L396-L408】
- **Auswirkung:** Sichtbarer Jitter beim Navigieren durch Zeiträume sowie unnötige Doppel-Requests gegen `/api/leaderboard/aggregate`, obwohl die Daten lokal gecacht sind.
- **Minimaländerung:** Vor dem Setzen von `loading` prüfen, ob bereits gecachte Daten existieren (`if (!aggregateCacheRef.current[p]) setLoading(true)`). Optional ein `inFlightRef` nutzen, um identische Requests zu deduplizieren und `finally` nur für den jeweils letzten Request auszuführen.

Durch diese drei Eingriffe lässt sich das wahrgenommene "Hängen" des Leaderboards deutlich reduzieren, ohne größere Refactorings vornehmen zu müssen.
