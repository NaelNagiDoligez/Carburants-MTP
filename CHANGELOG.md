# Journal des versions

## Prochaine version — toute la France

- Premier lancement : l'écran « Où es-tu ? » explique à quoi sert la position avant que le téléphone ne demande l'autorisation.
- **Ruptures** : le type (temporaire, définitive) et le début des ruptures déclarées par les stations sont collectés et affichés (« rupture temporaire depuis 3 j ») ; le classement indique combien de stations du rayon sont écartées pour rupture.
- **Heure du relevé** : l'en-tête affiche l'heure de la dernière collecte, et plus celle de la publication du site ; source et date du relevé toujours visibles en bas de la liste.
- Confidentialité : la page décrit exactement ce qui est sauvegardé (lieux et trajets compris) et ce qui est transmis aux services d'adresse et d'itinéraire.
- Accessibilité : flèches du clavier sur les carburants et les onglets, curseur Rayon étiqueté, suggestions d'adresses annoncées, pastilles de carte nommées, cibles tactiles agrandies.
- Réglages : titre « Réglages », nom court du véhicule dans la pastille, curseur du réservoir aux couleurs de l'appli, lever et coucher du soleil calculés là où tu es.
- Données : dimension des stations stable (le dépôt ne grossit plus de 270 Ko par collecte), prix hors bornes écartés sans bloquer la collecte, enseigne OpenStreetMap reprise seulement à moins de 150 m, fourchette de prévision élargie, tests avant chaque publication, collecte planifiée toutes les 4 h.
- Tableau de bord Streamlit : médianes par jour, prévision et fiabilité, ruptures, état de la collecte.

- Trajet : les cases et le champ ne dépassent plus de la carte sur téléphone (adresses longues).
- Mise à jour : l'appli connaît désormais sa propre version (elle ne se comparait qu'à celle du serveur, donc jamais de bandeau avec du code ancien) ; le service worker contourne le cache HTTP de GitHub Pages à l'installation et à chaque chargement, ce qui bloquait les mises à jour pendant ~10 min.

- Trajet : une petite croix sur chaque trajet récent pour le retirer (avec « Annuler »).

- Un fichier de prix par département (avec 35 km de marge de frontière), chargé selon la position ; départements traversés chargés pour un trajet.
- Écran « Où es-tu ? » si la position est refusée (réactivation expliquée, ou adresse de départ).
- Trajets enregistrés (avec date facultative), bandeau « nouvelle version », lieux enregistrés, véhicules modifiables d'un toucher.

## v0.9 (bêta) — 2 novembre 2026

Première version complète pour Montpellier et ses alentours (Hérault, Gard).

- Collecte des prix officiels toutes les 6 h, contrôles qualité, historique Parquet, positions OpenStreetMap.
- Classement par coût total (plein + détour), véhicule, niveau du réservoir et autonomie ; E10 suggéré.
- Onglets Stations, Carte, Trajet (stations sur la route, détour, Google Maps et Plans avec arrêt), Favoris, Carnet (économies, conso réelle).
- Mode guidon, thème jour/nuit au coucher du soleil, jardin brodé selon la saison, motion « tout se coud ».
- Courbe des prix et prévision à 7 jours, étiquetée expérimentale, avec score de fiabilité mesuré sur le passé.
- Amis (Supabase) : connexion Google, codes d'invitation, classement d'économies, « carburant épuisé », sauvegarde, suppression du profil, page confidentialité.

Restent à valider avant la v1 : les amis avec un vrai deuxième profil, la restauration de la sauvegarde sur un autre appareil.
