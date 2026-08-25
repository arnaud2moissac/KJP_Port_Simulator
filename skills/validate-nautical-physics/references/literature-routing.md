# Routage bibliographique

## Sommaire

1. Hiérarchie des preuves
2. Sources par composant
3. Applicabilité
4. Recherche et citation

## 1. Hiérarchie des preuves

Préférer dans l'ordre :

1. essais propres au bateau ou composant ;
2. données constructeur du modèle exact ;
3. essais d'une coque ou configuration comparable ;
4. méthode primaire publiée applicable à la classe ;
5. estimation géométrique ;
6. calibration pédagogique documentée.

Ne pas utiliser un blog ou une fiche commerciale comme preuve d'un
coefficient hydrodynamique. Une source secondaire peut orienter la recherche,
pas clore la validation.

## 2. Sources par composant

### Équations et courant

- T. I. Fossen, Marine Craft Model :
  <https://fossen.biz/html/marineCraftModel.html>

Utiliser pour masse, Coriolis, passivité et vitesse relative au courant.

### Manœuvrabilité coque–hélice–safran

- Yasukawa & Yoshimura, MMG standard :
  <https://doi.org/10.1007/s00773-014-0293-y>
- Ito, Takashina & Yasukawa, basse vitesse :
  <https://www.jstage.jst.go.jp/article/jjasnaoe/42/0/42_17/_article/-char/en>

Vérifier classe, nombre d'hélices, gouvernes et domaine de dérive avant de
transférer une relation.

### Vent

- Fujiwara, Ueno & Ikeda, forces et moments :
  <https://doi.org/10.2534/jjasnaoe.2.243>
- ITTC 2024, modélisation aérodynamique :
  <https://ittc.info/media/11806/75-02-03-019.pdf>

L'ITTC citée exclut les yachts de son domaine quantitatif. Utiliser ses
principes de structure, pas des coefficients de cargo comme calibration.

### Validation

- ITTC, Validation of Manoeuvring Simulation Models :
  <https://ittc.info/media/1894/75-02-06-03.pdf>

Documenter force, modèle, intégration, logiciel, manœuvres, incertitude et
sensibilité.

### Propulsion

Utiliser la documentation moteur, inverseur et hélice du modèle exact.
Rechercher les courbes quatre quadrants ou séries systématiques correspondant
au nombre de pales, `P/D` et `AE/A0`.

### Dérive empirique

- US Coast Guard, National SAR Supplement, annexe G :
  <https://www.dco.uscg.mil/Portals/9/CG-5R/manuals/Natl_SAR_Supp.pdf>

Traiter les pourcentages de dérive comme enveloppes de catégorie avec
dispersion, jamais comme constantes universelles.

## 3. Applicabilité

Pour chaque source, noter :

- classe de navire ;
- échelle et Reynolds ;
- vitesse et angle ;
- profondeur ;
- nombre et type d'appendices ;
- nombre et sens des propulseurs ;
- état de charge ;
- données mesurées ou régressées ;
- incertitude.

Refuser un transfert lorsque le mécanisme dominant change : cargo vers yacht,
monocoque vers catamaran, déplacement vers planant, simple vers double hélice,
quille longue vers quille fine, eau profonde vers faible profondeur.

## 4. Recherche et citation

Rechercher d'abord les sources primaires et officielles. Pour une donnée
évolutive, vérifier la version actuelle.

Limiter les citations à ce qu'elles démontrent réellement. Distinguer :

- fait sourcé ;
- calcul dérivé ;
- inférence ;
- hypothèse ;
- calibration.

Inscrire dans le profil la référence stable, l'unité, la valeur utilisée et la
raison de son applicabilité.
