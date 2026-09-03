# TPA Reference — Countries / Territories 2025

The predetermined answer list for `Entity Registered Country` (field 3) and `Person Country of Residence` (field 8), and the **country risk score** input to risk tiering (`extractor.md` §5).

**252 entries.** Codes and region names extracted from `1. TPA Functional Spec Standard v1.0 ok.xlsx`, sheet `CountriesTerritories 2025`. Risk scores from the R&C TPA risk-scoring rubric.

**Matching rule:** match the country/territory named or implied in the documents to the closest exact entry (e.g. "Republic of Singapore" → `Singapore`). If a document names a country not listed here (an obsolete or alternate name), select the closest equivalent, note the substitution, and use that entry's score.

**Unknown country:** `Not Known` and `None` both score 3. These are the fallback for a country you genuinely cannot map — not a shortcut past a match you could have made (`extractor.md` §5). Flag the field for confirmation whenever you use one, and never leave the country term out of the risk score.

**Maintenance:** a point-in-time copy of a year-versioned sheet. Regenerate both columns together if the Functional Spec moves to a newer year, or if R&C revises the scoring rubric.

---

| Code | Country / Territory | Risk score |
| :--- | :--- | ---: |
| ABKHAZ | Abkhazia | 3 |
| AFGH | Afghanistan | 3 |
| ALB | Albania | 3 |
| ALG | Algeria | 3 |
| AMSAM | American Samoa | 3 |
| ANDO | Andorra | 3 |
| ANGOL | Angola | 3 |
| ANGUIL | Anguilla | 3 |
| AARCT | Antarctica | 3 |
| ANTA | Antigua and Barbuda | 3 |
| ARG | Argentina | 3 |
| ARMEN | Armenia | 3 |
| ARUBA | Aruba | 3 |
| AUSTR | Australia | 1 |
| AUST | Austria | 2 |
| AZERB | Azerbaijan | 3 |
| BAH | Bahamas | 2 |
| BAHRN | Bahrain | 3 |
| BANDH | Bangladesh | 3 |
| BARB | Barbados | 3 |
| BYELRS | Belarus | 11 |
| BELG | Belgium | 2 |
| BELZ | Belize | 3 |
| BENIN | Benin | 3 |
| BERM | Bermuda | 3 |
| BHUTAN | Bhutan | 3 |
| BOL | Bolivia | 3 |
| BSHZG | Bosnia and Herzegovina | 3 |
| BOTS | Botswana | 3 |
| BOUV | Bouvet Island | 3 |
| BRAZ | Brazil | 3 |
| BIOT | British Indian Ocean Territory | 3 |
| BVI | British Virgin Islands | 3 |
| BRUNEI | Brunei | 3 |
| BUL | Bulgaria | 3 |
| UPVOLA | Burkina Faso | 3 |
| BURUN | Burundi | 3 |
| KAMPA | Cambodia | 3 |
| CAMER | Cameroon | 3 |
| CANA | Canada | 1 |
| CVI | Cape Verde | 2 |
| CAYI | Cayman Islands | 3 |
| CAFR | Central African Republic | 3 |
| CHAD | Chad | 3 |
| CHIL | Chile | 2 |
| CHINA | China | 3 |
| CHR | Christmas Island | 3 |
| COCOS | Cocos (Keeling) Islands | 3 |
| COL | Colombia | 3 |
| COMOR | Comoros | 3 |
| CONGO | Congo Republic | 3 |
| COOKIS | Cook Islands | 3 |
| COSR | Costa Rica | 3 |
| ICST | Cote d'Ivoire | 3 |
| CRTIA | Croatia | 3 |
| CUBA | Cuba | 11 |
| NANT | Curaçao | 3 |
| CYPR | Cyprus | 3 |
| CZREP | Czech Republic | 3 |
| ZAIRE | Democratic Republic of the Congo | 3 |
| DEN | Denmark | 1 |
| TAI | Djibouti | 3 |
| DOMA | Dominica | 2 |
| DOMR | Dominican Republic | 3 |
| ECU | Ecuador | 3 |
| EGYPT | Egypt | 3 |
| ELSAL | El Salvador | 3 |
| EQGNA | Equatorial Guinea | 3 |
| ERTRA | Eritrea | 3 |
| ESTNIA | Estonia | 1 |
| ETHPA | Ethiopia | 3 |
| FALK | Falkland Islands | 3 |
| FAEROE | Faroe Islands | 3 |
| FIJI | Fiji | 3 |
| FIN | Finland | 1 |
| FRA | France | 2 |
| FGNA | French Guiana | 3 |
| FPOLY | French Polynesia | 3 |
| GABON | Gabon | 3 |
| GAMB | Gambia | 3 |
| GRGIA | Georgia | 3 |
| GFR | Germany | 1 |
| GHANA | Ghana | 3 |
| GIB | Gibraltar | 3 |
| GREECE | Greece | 3 |
| GREENL | Greenland | 3 |
| GREN | Grenada | 3 |
| GUAD | Guadeloupe | 3 |
| GUAM | Guam | 3 |
| GUAT | Guatemala | 3 |
| GUERN | Guernsey | 3 |
| GUREP | Guinea | 3 |
| GUBI | Guinea-Bissau | 3 |
| GUY | Guyana | 3 |
| HAIT | Haiti | 3 |
| HEARD | Heard and McDonald Islands | 3 |
| HON | Honduras | 3 |
| HKONG | Hong Kong | 1 |
| HUNG | Hungary | 3 |
| ICEL | Iceland | 1 |
| INDIA | India | 3 |
| INDON | Indonesia | 3 |
| INTERNATIONAL | International | 3 |
| IRAN | Iran | 11 |
| IRAQ | Iraq | 3 |
| IRE | Ireland | 1 |
| ISLEOM | Isle of Man | 3 |
| ISRAEL | Israel | 2 |
| ITALY | Italy | 3 |
| JAMA | Jamaica | 3 |
| JAP | Japan | 1 |
| JERSEY | Jersey | 3 |
| JORDAN | Jordan | 3 |
| KAZK | Kazakhstan | 3 |
| KENYA | Kenya | 3 |
| KIRB | Kiribati | 3 |
| KOSOVO | Kosovo | 3 |
| KUWAIT | Kuwait | 3 |
| KIRGH | Kyrgyzstan | 3 |
| LAOS | Laos | 3 |
| LATV | Latvia | 3 |
| LEBAN | Lebanon | 3 |
| LESOT | Lesotho | 3 |
| LIBER | Liberia | 3 |
| LIBYA | Libya | 3 |
| LIECHT | Liechtenstein | 3 |
| LITH | Lithuania | 2 |
| LUX | Luxembourg | 1 |
| MACAO | Macau | 3 |
| MALAG | Madagascar | 3 |
| MALAW | Malawi | 3 |
| MALAY | Malaysia | 3 |
| MALDR | Maldives | 3 |
| MALI | Mali | 3 |
| MALTA | Malta | 3 |
| MAH | Marshall Islands | 3 |
| MARQ | Martinique | 3 |
| MAURTN | Mauritania | 3 |
| MAURTS | Mauritius | 3 |
| MAYOT | Mayotte | 3 |
| MEX | Mexico | 3 |
| FESMIC | Micronesia | 3 |
| MOLDV | Moldova | 3 |
| MONAC | Monaco | 3 |
| MONGLA | Mongolia | 3 |
| MNTNG | Montenegro | 3 |
| MONT | Montserrat | 3 |
| MOROC | Morocco | 3 |
| MOZAM | Mozambique | 3 |
| BURMA | Myanmar | 3 |
| NAMIB | Namibia | 3 |
| NAURU | Nauru | 3 |
| NEPAL | Nepal | 3 |
| NETH | Netherlands | 1 |
| NEWCAL | New Caledonia | 3 |
| NZ | New Zealand | 1 |
| NICG | Nicaragua | 3 |
| NIGER | Niger | 3 |
| NIGEA | Nigeria | 3 |
| NIUE | Niue | 3 |
| NONE | None | 3 |
| NORFIS | Norfolk Island | 3 |
| NKOREA | North Korea | 11 |
| MCDNIA | North Macedonia | 3 |
| NOMARI | Northern Mariana Islands | 3 |
| NORW | Norway | 1 |
| NOTK | Not Known | 3 |
| OMAN | Oman | 3 |
| PAKIS | Pakistan | 3 |
| PALAU | Palau | 3 |
| PALEST | Palestine | 3 |
| PANA | Panama | 3 |
| PAPNG | Papua New Guinea | 3 |
| PARA | Paraguay | 3 |
| PERU | Peru | 3 |
| PHLNS | Philippines | 3 |
| PITCIS | Pitcairn | 3 |
| POL | Poland | 3 |
| PORL | Portugal | 3 |
| PURI | Puerto Rico | 3 |
| QATAR | Qatar | 3 |
| REUNI | Reunion | 3 |
| ROM | Romania | 3 |
| RUSS | Russia | 11 |
| RWANDA | Rwanda | 3 |
| SBRTHY | Saint Barthélemy | 3 |
| SLUC | Saint Lucia | 3 |
| WSOMOA | Samoa | 3 |
| SMARNO | San Marino | 3 |
| PST | Sao Tome and Principe | 3 |
| SAARAB | Saudi Arabia | 3 |
| SENEG | Senegal | 3 |
| YUG | Serbia | 3 |
| SEYCH | Seychelles | 1 |
| SILEN | Sierra Leone | 3 |
| SINGP | Singapore | 1 |
| SLVAK | Slovakia | 3 |
| SLVNIA | Slovenia | 2 |
| SOLIL | Solomon Islands | 3 |
| SOMAL | Somalia | 3 |
| SAFR | South Africa | 3 |
| SGSSI | South Georgia and South Sandwich Islands | 3 |
| SKOREA | South Korea | 2 |
| SOSSRT | South Ossetia | 3 |
| SOUSUD | South Sudan | 3 |
| SPAIN | Spain | 3 |
| SRILAN | Sri Lanka | 3 |
| STHEL | St. Helena | 3 |
| SKIT | St. Kitts and Nevis | 3 |
| SINTMA | St. Maarten | 3 |
| STMART | St. Martin | 3 |
| STPM | St. Pierre and Miquelon | 3 |
| SVIN | St. Vincent and the Grenadines | 2 |
| SUDAN | Sudan | 3 |
| SURM | Suriname | 3 |
| SVALB | Svalbard and Jan Mayen Islands | 3 |
| SWAZD | Swaziland/Eswatini | 3 |
| SWED | Sweden | 1 |
| SWITZ | Switzerland | 1 |
| SYRIA | Syria | 11 |
| TAIWAN | Taiwan | 2 |
| TADZK | Tajikistan | 3 |
| TANZA | Tanzania | 3 |
| THAIL | Thailand | 3 |
| TIMOR | Timor Leste | 3 |
| TOGO | Togo | 3 |
| TOKLAU | Tokelau | 3 |
| TONGA | Tonga | 3 |
| TRTO | Trinidad and Tobago | 3 |
| TUNIS | Tunisia | 3 |
| TURK | Turkey | 3 |
| TURNC | Turkish Republic of Northern Cyprus | 3 |
| TURKM | Turkmenistan | 3 |
| TCAI | Turks and Caicos Islands | 3 |
| TVLU | Tuvalu | 3 |
| VI | U.S. Virgin Islands | 3 |
| UGANDA | Uganda | 3 |
| UKRN | Ukraine | 11 |
| UAE | United Arab Emirates | 3 |
| UK | United Kingdom | 1 |
| USA | United States | 2 |
| URU | Uruguay | 1 |
| UZBK | Uzbekistan | 3 |
| VANU | Vanuatu | 3 |
| VCAN | Vatican City | 3 |
| VEN | Venezuela | 3 |
| VIETN | Vietnam | 3 |
| WALLIS | Wallis and Futuna Islands | 3 |
| SPSAH | Western Sahara | 3 |
| YEMAR | Yemen | 3 |
| ZAMBIA | Zambia | 3 |
| ZIMBAB | Zimbabwe | 3 |
