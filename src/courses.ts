export interface Course {
  id: string;
  name: string;
  /** Town / region shown on reveal. */
  place: string;
  country: string;
  lat: number;
  lon: number;
  /** Hint shown while guessing. Should not name the town. */
  clue: string;
  /** 1 = famous, 2 = known to golf fans, 3 = deep cut. Easier holes are played first. */
  tier: 1 | 2 | 3;
}

// Coordinates point at the course itself (usually the clubhouse), accurate to roughly a few km.
export const COURSES: Course[] = [
  // ── United States ─────────────────────────────────────────────
  { id: "augusta-national", name: "Augusta National Golf Club", place: "Augusta, Georgia", country: "United States", lat: 33.503, lon: -82.021, clue: "Home of the Masters, with the azaleas of Amen Corner.", tier: 1 },
  { id: "pebble-beach", name: "Pebble Beach Golf Links", place: "Pebble Beach, California", country: "United States", lat: 36.568, lon: -121.950, clue: "Clifftop holes on a Pacific bay; hosted the U.S. Open six times.", tier: 1 },
  { id: "cypress-point", name: "Cypress Point Club", place: "Pebble Beach, California", country: "United States", lat: 36.581, lon: -121.966, clue: "Alister MacKenzie's par-3 16th carries over crashing Pacific surf.", tier: 2 },
  { id: "tpc-sawgrass", name: "TPC Sawgrass (Stadium Course)", place: "Ponte Vedra Beach, Florida", country: "United States", lat: 30.198, lon: -81.394, clue: "Home of THE PLAYERS Championship and the island-green 17th.", tier: 1 },
  { id: "pinehurst-2", name: "Pinehurst No. 2", place: "Pinehurst, North Carolina", country: "United States", lat: 35.190, lon: -79.470, clue: "Donald Ross's turtleback greens in the Sandhills; a U.S. Open 'anchor site'.", tier: 1 },
  { id: "oakmont", name: "Oakmont Country Club", place: "Oakmont, Pennsylvania", country: "United States", lat: 40.527, lon: -79.826, clue: "Record ten-time U.S. Open host, famous for the 'Church Pews' bunker.", tier: 2 },
  { id: "shinnecock", name: "Shinnecock Hills Golf Club", place: "Southampton, New York", country: "United States", lat: 40.895, lon: -72.440, clue: "A founding member of the USGA; hosted the second U.S. Open, in 1896.", tier: 2 },
  { id: "bethpage-black", name: "Bethpage Black", place: "Farmingdale, New York", country: "United States", lat: 40.745, lon: -73.455, clue: "A public course with a warning sign at the 1st tee; 2025 Ryder Cup host.", tier: 1 },
  { id: "winged-foot", name: "Winged Foot Golf Club", place: "Mamaroneck, New York", country: "United States", lat: 40.957, lon: -73.755, clue: "A.W. Tillinghast design; scene of the 1974 'Massacre at Winged Foot'.", tier: 2 },
  { id: "baltusrol", name: "Baltusrol Golf Club", place: "Springfield, New Jersey", country: "United States", lat: 40.697, lon: -74.335, clue: "Jack Nicklaus won two U.S. Opens here, in 1967 and 1980.", tier: 3 },
  { id: "merion", name: "Merion Golf Club (East)", place: "Ardmore, Pennsylvania", country: "United States", lat: 40.005, lon: -75.309, clue: "Wicker baskets top the flagsticks; Bobby Jones completed his Grand Slam here in 1930.", tier: 2 },
  { id: "pine-valley", name: "Pine Valley Golf Club", place: "Pine Valley, New Jersey", country: "United States", lat: 39.786, lon: -74.971, clue: "A sand-and-pine fortress, long ranked the No. 1 course in the world.", tier: 2 },
  { id: "whistling-straits", name: "Whistling Straits", place: "Haven, Wisconsin", country: "United States", lat: 43.851, lon: -87.735, clue: "Pete Dye's links-style layout on a Great Lake; hosted the 2021 Ryder Cup.", tier: 2 },
  { id: "kiawah-ocean", name: "Kiawah Island (Ocean Course)", place: "Kiawah Island, South Carolina", country: "United States", lat: 32.609, lon: -80.029, clue: "The 1991 'War by the Shore' Ryder Cup, and Phil Mickelson's PGA win at age 50.", tier: 2 },
  { id: "harbour-town", name: "Harbour Town Golf Links", place: "Hilton Head Island, South Carolina", country: "United States", lat: 32.138, lon: -80.811, clue: "A red-and-white striped lighthouse stands behind the 18th green.", tier: 2 },
  { id: "torrey-pines", name: "Torrey Pines (South)", place: "La Jolla, San Diego, California", country: "United States", lat: 32.900, lon: -117.250, clue: "Clifftop municipal course where Tiger won the 2008 U.S. Open on a broken leg.", tier: 1 },
  { id: "riviera", name: "Riviera Country Club", place: "Pacific Palisades, Los Angeles", country: "United States", lat: 34.050, lon: -118.501, clue: "Nicknamed 'Hogan's Alley'; home of the Genesis Invitational.", tier: 2 },
  { id: "olympic-club", name: "The Olympic Club (Lake Course)", place: "San Francisco, California", country: "United States", lat: 37.709, lon: -122.495, clue: "Where Arnold Palmer let a seven-shot U.S. Open lead slip away in 1966.", tier: 2 },
  { id: "chambers-bay", name: "Chambers Bay", place: "University Place, Washington", country: "United States", lat: 47.201, lon: -122.572, clue: "Built in a former sand-and-gravel quarry on Puget Sound; 2015 U.S. Open.", tier: 2 },
  { id: "bandon-dunes", name: "Bandon Dunes", place: "Bandon, Oregon", country: "United States", lat: 43.188, lon: -124.393, clue: "A remote clifftop links resort: 'golf as it was meant to be'.", tier: 2 },
  { id: "muirfield-village", name: "Muirfield Village Golf Club", place: "Dublin, Ohio", country: "United States", lat: 40.116, lon: -83.163, clue: "Jack Nicklaus built it, and hosts the Memorial Tournament here.", tier: 2 },
  { id: "medinah", name: "Medinah Country Club (No. 3)", place: "Medinah, Illinois", country: "United States", lat: 41.973, lon: -88.046, clue: "Scene of Europe's 2012 Ryder Cup comeback, the 'Miracle' named for this club.", tier: 2 },
  { id: "kapalua", name: "Kapalua (Plantation Course)", place: "Maui, Hawaii", country: "United States", lat: 20.999, lon: -156.649, clue: "Broad volcanic slopes host the PGA Tour's winners-only season opener.", tier: 2 },
  { id: "east-lake", name: "East Lake Golf Club", place: "Atlanta, Georgia", country: "United States", lat: 33.742, lon: -84.302, clue: "Bobby Jones's home course; hosts the season-ending TOUR Championship.", tier: 2 },
  { id: "valhalla", name: "Valhalla Golf Club", place: "Louisville, Kentucky", country: "United States", lat: 38.247, lon: -85.488, clue: "PGA Championships won here by Tiger (2000), Rory (2014) and Xander (2024).", tier: 3 },
  { id: "southern-hills", name: "Southern Hills Country Club", place: "Tulsa, Oklahoma", country: "United States", lat: 36.075, lon: -95.957, clue: "Tiger won the 2007 PGA Championship here in blistering August heat.", tier: 3 },
  { id: "tpc-scottsdale", name: "TPC Scottsdale (Stadium Course)", place: "Scottsdale, Arizona", country: "United States", lat: 33.642, lon: -111.911, clue: "Home of golf's rowdiest hole: a fully enclosed stadium par-3 16th.", tier: 2 },
  { id: "quail-hollow", name: "Quail Hollow Club", place: "Charlotte, North Carolina", country: "United States", lat: 35.106, lon: -80.849, clue: "Its closing stretch, 'the Green Mile', hosted the 2025 PGA Championship.", tier: 3 },
  { id: "congressional", name: "Congressional Country Club", place: "Bethesda, Maryland", country: "United States", lat: 39.002, lon: -77.172, clue: "Rory McIlroy set the U.S. Open scoring record here in 2011.", tier: 3 },
  { id: "hazeltine", name: "Hazeltine National Golf Club", place: "Chaska, Minnesota", country: "United States", lat: 44.817, lon: -93.618, clue: "Host of the 2016 Ryder Cup and Y.E. Yang's 2009 PGA upset of Tiger.", tier: 3 },
  { id: "oak-hill", name: "Oak Hill Country Club", place: "Pittsford, New York", country: "United States", lat: 43.117, lon: -77.531, clue: "Brooks Koepka won the 2023 PGA Championship on its East Course.", tier: 3 },
  { id: "shadow-creek", name: "Shadow Creek", place: "North Las Vegas, Nevada", country: "United States", lat: 36.253, lon: -115.127, clue: "A forested oasis carved out of flat desert; site of Tiger vs. Phil's 2018 'The Match'.", tier: 3 },
  { id: "bay-hill", name: "Bay Hill Club & Lodge", place: "Orlando, Florida", country: "United States", lat: 28.461, lon: -81.507, clue: "Arnold Palmer's own club, home of the invitational that bears his name.", tier: 2 },
  { id: "cherry-hills", name: "Cherry Hills Country Club", place: "Cherry Hills Village, Colorado", country: "United States", lat: 39.648, lon: -104.958, clue: "Arnold Palmer drove the 1st green here on his way to the 1960 U.S. Open title.", tier: 3 },
  { id: "mauna-kea", name: "Mauna Kea Golf Course", place: "Kohala Coast, Hawaii", country: "United States", lat: 20.005, lon: -155.823, clue: "Robert Trent Jones Sr. built it on black lava; the par-3 3rd carries ocean surf.", tier: 3 },
  { id: "furnace-creek", name: "Furnace Creek Golf Course", place: "Death Valley, California", country: "United States", lat: 36.452, lon: -116.862, clue: "The world's lowest course, about 214 feet below sea level.", tier: 3 },
  { id: "coeur-d-alene", name: "The Coeur d'Alene Resort Golf Course", place: "Coeur d'Alene, Idaho", country: "United States", lat: 47.669, lon: -116.760, clue: "Its 14th hole has the world's only movable floating island green.", tier: 3 },

  // ── Canada ────────────────────────────────────────────────────
  { id: "cabot-cliffs", name: "Cabot Cliffs", place: "Inverness, Nova Scotia", country: "Canada", lat: 46.240, lon: -61.300, clue: "Coore & Crenshaw's clifftop holes above a wide gulf; sister course of Cabot Links.", tier: 2 },
  { id: "banff-springs", name: "Banff Springs Golf Course", place: "Banff, Alberta", country: "Canada", lat: 51.166, lon: -115.551, clue: "Stanley Thompson's mountain course beside a castle-like railway hotel.", tier: 2 },
  { id: "royal-montreal", name: "Royal Montreal Golf Club", place: "Île Bizard, Quebec", country: "Canada", lat: 45.497, lon: -73.900, clue: "The oldest golf club in North America, founded in 1873.", tier: 2 },
  { id: "st-georges", name: "St. George's Golf and Country Club", place: "Toronto, Ontario", country: "Canada", lat: 43.670, lon: -79.532, clue: "A Stanley Thompson classic; Rory McIlroy won the national Open here in 2022.", tier: 3 },

  // ── Mexico, Caribbean & Atlantic ──────────────────────────────
  { id: "el-camaleon", name: "El Camaleón at Mayakoba", place: "Playa del Carmen, Quintana Roo", country: "Mexico", lat: 20.686, lon: -87.034, clue: "Jungle, mangroves and limestone canals; its country's first PGA Tour stop (2007).", tier: 3 },
  { id: "punta-mita", name: "Punta Mita (Pacífico Course)", place: "Punta de Mita, Nayarit", country: "Mexico", lat: 20.777, lon: -105.524, clue: "The optional par-3 'Tail of the Whale' plays to a natural island green.", tier: 3 },
  { id: "teeth-of-the-dog", name: "Teeth of the Dog", place: "Casa de Campo, La Romana", country: "Dominican Republic", lat: 18.405, lon: -68.907, clue: "A Pete Dye design with seven holes right on the Caribbean Sea.", tier: 2 },
  { id: "mid-ocean", name: "Mid Ocean Club", place: "Tucker's Town", country: "Bermuda", lat: 32.339, lon: -64.692, clue: "C.B. Macdonald's island course, famous for its 'Cape' 5th over a lake.", tier: 3 },
  { id: "albany", name: "Albany Golf Club", place: "New Providence", country: "The Bahamas", lat: 24.995, lon: -77.512, clue: "Hosts Tiger Woods's Hero World Challenge each December.", tier: 3 },
  { id: "royal-westmoreland", name: "Royal Westmoreland", place: "St. James", country: "Barbados", lat: 13.215, lon: -59.628, clue: "A Robert Trent Jones Jr. design on an island's 'Platinum Coast'.", tier: 3 },

  // ── South America ─────────────────────────────────────────────
  { id: "olympic-rio", name: "Olympic Golf Course", place: "Barra da Tijuca, Rio de Janeiro", country: "Brazil", lat: -23.000, lon: -43.408, clue: "Built for golf's return to the Olympic Games in 2016.", tier: 1 },
  { id: "jockey-club", name: "Jockey Club (Red Course)", place: "San Isidro, Buenos Aires", country: "Argentina", lat: -34.490, lon: -58.530, clue: "Alister MacKenzie laid out its Red and Blue courses in the 1930s.", tier: 3 },
  { id: "llao-llao", name: "Llao Llao Golf Course", place: "San Carlos de Bariloche", country: "Argentina", lat: -41.053, lon: -71.533, clue: "Lakeside holes beside a famous Patagonian resort hotel in the Andes.", tier: 3 },
  { id: "ushuaia", name: "Ushuaia Golf Club", place: "Ushuaia, Tierra del Fuego", country: "Argentina", lat: -54.820, lon: -68.370, clue: "One of the southernmost golf courses on Earth, at 'the end of the world'.", tier: 3 },
  { id: "la-paz", name: "La Paz Golf Club", place: "Mallasilla, La Paz", country: "Bolivia", lat: -16.560, lon: -68.080, clue: "One of the world's highest courses, more than 3,300 m above sea level.", tier: 3 },
  { id: "los-leones", name: "Club de Golf Los Leones", place: "Santiago", country: "Chile", lat: -33.425, lon: -70.595, clue: "A traditional capital-city club framed by the snow-capped Andes.", tier: 3 },
  { id: "golf-uruguay", name: "Club de Golf del Uruguay", place: "Punta Carretas, Montevideo", country: "Uruguay", lat: -34.918, lon: -56.160, clue: "An Alister MacKenzie routing on a rocky point beside a wide estuary.", tier: 3 },

  // ── Scotland ──────────────────────────────────────────────────
  { id: "st-andrews-old", name: "The Old Course at St Andrews", place: "St Andrews, Fife", country: "Scotland", lat: 56.348, lon: -2.810, clue: "The 'Home of Golf': the Swilcan Bridge and the Road Hole.", tier: 1 },
  { id: "carnoustie", name: "Carnoustie Golf Links", place: "Carnoustie, Angus", country: "Scotland", lat: 56.497, lon: -2.723, clue: "'Car-nasty': where Jean van de Velde waded into the Barry Burn in 1999.", tier: 1 },
  { id: "muirfield", name: "Muirfield", place: "Gullane, East Lothian", country: "Scotland", lat: 56.043, lon: -2.824, clue: "Home of one of the world's oldest golf clubs; Phil Mickelson won the Open here in 2013.", tier: 2 },
  { id: "royal-troon", name: "Royal Troon Golf Club", place: "Troon, Ayrshire", country: "Scotland", lat: 55.532, lon: -4.647, clue: "The 'Postage Stamp' 8th is the shortest hole on the Open rota.", tier: 2 },
  { id: "turnberry", name: "Turnberry (Ailsa Course)", place: "Turnberry, Ayrshire", country: "Scotland", lat: 55.316, lon: -4.832, clue: "A lighthouse, and the 1977 'Duel in the Sun' between Watson and Nicklaus.", tier: 2 },
  { id: "royal-dornoch", name: "Royal Dornoch Golf Club", place: "Dornoch, Sutherland", country: "Scotland", lat: 57.878, lon: -4.025, clue: "A remote far-northern links, where Donald Ross learned the game.", tier: 3 },
  { id: "gleneagles", name: "Gleneagles (PGA Centenary)", place: "Auchterarder, Perthshire", country: "Scotland", lat: 56.285, lon: -3.746, clue: "Europe won the 2014 Ryder Cup on this inland resort course.", tier: 2 },
  { id: "machrihanish", name: "Machrihanish Golf Club", place: "Machrihanish, Kintyre", country: "Scotland", lat: 55.425, lon: -5.725, clue: "The opening tee shot carries an Atlantic beach, often called golf's best first hole.", tier: 3 },

  // ── England & Wales ───────────────────────────────────────────
  { id: "royal-birkdale", name: "Royal Birkdale Golf Club", place: "Southport, Merseyside", country: "England", lat: 53.621, lon: -3.029, clue: "Jordan Spieth took a drop on the practice range here and still won the 2017 Open.", tier: 2 },
  { id: "royal-liverpool", name: "Royal Liverpool (Hoylake)", place: "Hoylake, Merseyside", country: "England", lat: 53.386, lon: -3.185, clue: "Tiger won the 2006 Open here while hitting driver only once all week.", tier: 2 },
  { id: "royal-st-georges", name: "Royal St George's Golf Club", place: "Sandwich, Kent", country: "England", lat: 51.276, lon: 1.379, clue: "Hosted the first Open Championship played in England, in 1894.", tier: 3 },
  { id: "wentworth", name: "Wentworth Club (West Course)", place: "Virginia Water, Surrey", country: "England", lat: 51.400, lon: -0.593, clue: "The 'Burma Road'; home of the BMW PGA Championship.", tier: 2 },
  { id: "celtic-manor", name: "Celtic Manor Resort", place: "Newport", country: "Wales", lat: 51.600, lon: -2.945, clue: "The rain-soaked 2010 Ryder Cup finished on a Monday here.", tier: 2 },

  // ── Ireland & Northern Ireland ────────────────────────────────
  { id: "royal-county-down", name: "Royal County Down", place: "Newcastle, County Down", country: "Northern Ireland", lat: 54.220, lon: -5.883, clue: "Wild links laid out beneath the Mountains of Mourne.", tier: 2 },
  { id: "royal-portrush", name: "Royal Portrush (Dunluce Links)", place: "Portrush, County Antrim", country: "Northern Ireland", lat: 55.203, lon: -6.635, clue: "Hosted the Open in 2019 and 2025, its first since 1951.", tier: 1 },
  { id: "ballybunion", name: "Ballybunion Golf Club (Old)", place: "Ballybunion, County Kerry", country: "Ireland", lat: 52.510, lon: -9.677, clue: "Towering Atlantic dunes, and a statue of Bill Clinton in the village.", tier: 2 },
  { id: "lahinch", name: "Lahinch Golf Club", place: "Lahinch, County Clare", country: "Ireland", lat: 52.936, lon: -9.345, clue: "Its goats forecast the weather; home of the blind 'Klondyke' and 'Dell' holes.", tier: 3 },
  { id: "portmarnock", name: "Portmarnock Golf Club", place: "Portmarnock, County Dublin", country: "Ireland", lat: 53.425, lon: -6.124, clue: "Links on a dune peninsula with water on three sides; a longtime Irish Open venue.", tier: 3 },
  { id: "old-head", name: "Old Head Golf Links", place: "Kinsale, County Cork", country: "Ireland", lat: 51.610, lon: -8.535, clue: "On a promontory whose cliffs drop more than 90 m into the Atlantic.", tier: 2 },
  { id: "adare-manor", name: "Adare Manor", place: "Adare, County Limerick", country: "Ireland", lat: 52.564, lon: -8.784, clue: "Host of the 2027 Ryder Cup, on the grounds of a Gothic Revival manor.", tier: 2 },
  { id: "k-club", name: "The K Club", place: "Straffan, County Kildare", country: "Ireland", lat: 53.307, lon: -6.617, clue: "Europe routed the United States here in the 2006 Ryder Cup.", tier: 3 },

  // ── Continental Europe ────────────────────────────────────────
  { id: "le-golf-national", name: "Le Golf National (Albatros)", place: "Saint-Quentin-en-Yvelines", country: "France", lat: 48.754, lon: 2.076, clue: "Hosted the 2018 Ryder Cup and the 2024 Olympic golf tournaments.", tier: 1 },
  { id: "evian", name: "Evian Resort Golf Club", place: "Évian-les-Bains", country: "France", lat: 46.390, lon: 6.563, clue: "Hillside course above a great alpine lake; home to one of women's golf's five majors.", tier: 3 },
  { id: "valderrama", name: "Real Club Valderrama", place: "Sotogrande, Andalusia", country: "Spain", lat: 36.294, lon: -5.315, clue: "Hosted the first Ryder Cup played in continental Europe, in 1997.", tier: 1 },
  { id: "oitavos", name: "Oitavos Dunes", place: "Cascais", country: "Portugal", lat: 38.705, lon: -9.465, clue: "Atlantic dunes and umbrella pines near the westernmost point of mainland Europe.", tier: 3 },
  { id: "crans", name: "Crans-sur-Sierre Golf Club", place: "Crans-Montana, Valais", country: "Switzerland", lat: 46.308, lon: 7.477, clue: "Alpine plateau course about 1,500 m up; home of the European Masters.", tier: 2 },
  { id: "marco-simone", name: "Marco Simone Golf & Country Club", place: "Guidonia Montecelio, Lazio", country: "Italy", lat: 41.980, lon: 12.685, clue: "Hosted the 2023 Ryder Cup in the hills outside an ancient capital.", tier: 2 },
  { id: "kennemer", name: "Kennemer Golf & Country Club", place: "Zandvoort", country: "Netherlands", lat: 52.383, lon: 4.557, clue: "Harry Colt dune course a short bike ride from the North Sea beaches.", tier: 3 },
  { id: "falsterbo", name: "Falsterbo Golfklubb", place: "Falsterbo, Skåne", country: "Sweden", lat: 55.388, lon: 12.822, clue: "Links at the tip of a peninsula, with a lighthouse in the middle of the course.", tier: 3 },
  { id: "lofoten-links", name: "Lofoten Links", place: "Gimsøya, Lofoten", country: "Norway", lat: 68.315, lon: 14.110, clue: "Arctic island links where you can tee off under the midnight sun.", tier: 3 },
  { id: "westman-islands", name: "Westman Islands Golf Club", place: "Heimaey, Vestmannaeyjar", country: "Iceland", lat: 63.438, lon: -20.285, clue: "Holes laid out inside an extinct volcanic crater on a small island.", tier: 3 },
  { id: "green-zone", name: "Green Zone Golf", place: "Tornio / Haparanda", country: "Finland & Sweden", lat: 65.843, lon: 24.150, clue: "Its holes cross an international border, and a time zone.", tier: 3 },
  { id: "costa-navarino", name: "Costa Navarino (The Dunes)", place: "Messinia, Peloponnese", country: "Greece", lat: 36.996, lon: 21.660, clue: "A Bernhard Langer design among olive groves on the Ionian coast.", tier: 3 },
  { id: "carya", name: "Carya Golf Club", place: "Belek, Antalya", country: "Türkiye", lat: 36.856, lon: 31.047, clue: "Heathland-style layout among umbrella pines on a Mediterranean resort coast.", tier: 3 },

  // ── Africa ────────────────────────────────────────────────────
  { id: "leopard-creek", name: "Leopard Creek Country Club", place: "Malelane, Mpumalanga", country: "South Africa", lat: -25.460, lon: 31.535, clue: "Hippos and crocodiles lurk in the river bordering a famous national park.", tier: 3 },
  { id: "fancourt", name: "Fancourt (The Links)", place: "George, Western Cape", country: "South Africa", lat: -33.945, lon: 22.415, clue: "Hosted the 2003 Presidents Cup, which famously ended in a tie.", tier: 3 },
  { id: "durban-cc", name: "Durban Country Club", place: "Durban, KwaZulu-Natal", country: "South Africa", lat: -29.833, lon: 31.029, clue: "Dune-ridge course by the Indian Ocean; a frequent host of its national Open.", tier: 3 },
  { id: "gary-player-cc", name: "Gary Player Country Club", place: "Sun City, North West", country: "South Africa", lat: -25.337, lon: 27.093, clue: "Home of the 'Million Dollar' Challenge, next to the Lost City resort.", tier: 2 },
  { id: "royal-dar-es-salam", name: "Royal Golf Dar Es Salam", place: "Rabat", country: "Morocco", lat: 33.957, lon: -6.803, clue: "Robert Trent Jones Sr. design in a cork-oak forest; hosts the Trophée Hassan II.", tier: 3 },
  { id: "muthaiga", name: "Muthaiga Golf Club", place: "Nairobi", country: "Kenya", lat: -1.255, lon: 36.839, clue: "Founded in 1913 at about 1,600 m; a frequent host of its national Open.", tier: 3 },
  { id: "mena-house", name: "Mena House Golf Course", place: "Giza", country: "Egypt", lat: 29.986, lon: 31.133, clue: "Nine holes in the shadow of the Great Pyramid.", tier: 1 },
  { id: "ile-aux-cerfs", name: "Île aux Cerfs Golf Club", place: "Île aux Cerfs", country: "Mauritius", lat: -20.273, lon: 57.801, clue: "Reached only by boat: a private island in the Indian Ocean given over to golf.", tier: 3 },
  { id: "royal-harare", name: "Royal Harare Golf Club", place: "Harare", country: "Zimbabwe", lat: -17.807, lon: 31.043, clue: "Founded in 1898, with jacaranda trees lining its fairways.", tier: 3 },

  // ── Middle East ───────────────────────────────────────────────
  { id: "emirates-gc", name: "Emirates Golf Club (Majlis)", place: "Dubai", country: "United Arab Emirates", lat: 25.088, lon: 55.158, clue: "Clubhouse shaped like Bedouin tents; the region's first grass course.", tier: 2 },
  { id: "yas-links", name: "Yas Links", place: "Yas Island, Abu Dhabi", country: "United Arab Emirates", lat: 24.475, lon: 54.595, clue: "Kyle Phillips links with holes along the mangroves of the Arabian Gulf.", tier: 3 },

  // ── Asia ──────────────────────────────────────────────────────
  { id: "kasumigaseki", name: "Kasumigaseki Country Club", place: "Kawagoe, Saitama", country: "Japan", lat: 35.884, lon: 139.422, clue: "Hosted the Olympic golf tournaments in 2021.", tier: 2 },
  { id: "hirono", name: "Hirono Golf Club", place: "Miki, Hyōgo", country: "Japan", lat: 34.766, lon: 135.033, clue: "C.H. Alison's 1932 design, often ranked the best course in its country.", tier: 3 },
  { id: "kawana", name: "Kawana Hotel (Fuji Course)", place: "Itō, Shizuoka", country: "Japan", lat: 34.950, lon: 139.135, clue: "Clifftop holes facing a volcanic island and, on clear days, a famous peak.", tier: 3 },
  { id: "nine-bridges", name: "The Club at Nine Bridges", place: "Jeju Island", country: "South Korea", lat: 33.345, lon: 126.393, clue: "A volcanic-island course that hosted the first CJ Cup in 2017.", tier: 3 },
  { id: "mission-hills", name: "Mission Hills Golf Club", place: "Shenzhen, Guangdong", country: "China", lat: 22.720, lon: 114.060, clue: "Once named the world's largest golf club, with a dozen courses.", tier: 2 },
  { id: "sheshan", name: "Sheshan International Golf Club", place: "Songjiang, Shanghai", country: "China", lat: 31.090, lon: 121.190, clue: "Longtime home of the HSBC Champions, a World Golf Championship event.", tier: 3 },
  { id: "hong-kong-gc", name: "The Hong Kong Golf Club", place: "Fanling, New Territories", country: "Hong Kong", lat: 22.495, lon: 114.120, clue: "Founded in 1889; the traditional home of its city's Open.", tier: 3 },
  { id: "sentosa", name: "Sentosa Golf Club", place: "Sentosa Island", country: "Singapore", lat: 1.249, lon: 103.834, clue: "An island club with views of skyscrapers and passing container ships.", tier: 2 },
  { id: "delhi-gc", name: "Delhi Golf Club", place: "New Delhi", country: "India", lat: 28.595, lon: 77.233, clue: "Mughal-era tombs and peacocks dot the fairways.", tier: 2 },
  { id: "royal-calcutta", name: "Royal Calcutta Golf Club", place: "Tollygunge, Kolkata", country: "India", lat: 22.495, lon: 88.350, clue: "The oldest golf club outside Britain, founded in 1829.", tier: 2 },
  { id: "gulmarg", name: "Gulmarg Golf Club", place: "Gulmarg, Kashmir", country: "India", lat: 34.050, lon: 74.385, clue: "A Himalayan meadow at about 2,650 m, one of the world's highest courses.", tier: 3 },
  { id: "blue-canyon", name: "Blue Canyon Country Club", place: "Phuket", country: "Thailand", lat: 8.100, lon: 98.310, clue: "Tiger won here in 1998, on an island in the Andaman Sea.", tier: 3 },
  { id: "els-club-datai", name: "The Els Club Teluk Datai", place: "Langkawi", country: "Malaysia", lat: 6.425, lon: 99.670, clue: "Ernie Els routed it through ancient rainforest full of monkeys and hornbills.", tier: 3 },
  { id: "nirwana-bali", name: "Nirwana Bali Golf Club", place: "Tabanan, Bali", country: "Indonesia", lat: -8.620, lon: 115.088, clue: "Clifftop holes look out on a sea temple perched on a rock.", tier: 3 },
  { id: "wack-wack", name: "Wack Wack Golf and Country Club", place: "Mandaluyong, Metro Manila", country: "Philippines", lat: 14.592, lon: 121.049, clue: "Its East Course is a historic host of its country's national Open.", tier: 3 },
  { id: "dalat-palace", name: "Dalat Palace Golf Club", place: "Da Lat, Lâm Đồng", country: "Vietnam", lat: 11.953, lon: 108.450, clue: "A colonial-era hill-station course among pine forests at about 1,500 m.", tier: 3 },

  // ── Oceania ───────────────────────────────────────────────────
  { id: "royal-melbourne", name: "Royal Melbourne (West Course)", place: "Black Rock, Victoria", country: "Australia", lat: -37.970, lon: 145.030, clue: "Alister MacKenzie's Sandbelt masterpiece.", tier: 1 },
  { id: "nsw-gc", name: "The New South Wales Golf Club", place: "La Perouse, Sydney", country: "Australia", lat: -33.998, lon: 151.235, clue: "Windswept clifftop links overlooking the bay where Captain Cook landed in 1770.", tier: 2 },
  { id: "barnbougle", name: "Barnbougle Dunes", place: "Bridport, Tasmania", country: "Australia", lat: -41.000, lon: 147.420, clue: "Giant dunes on an island's north coast; co-designed by Tom Doak.", tier: 3 },
  { id: "cape-wickham", name: "Cape Wickham Links", place: "King Island, Tasmania", country: "Australia", lat: -39.592, lon: 143.942, clue: "Links on a small island in Bass Strait, beside the country's tallest lighthouse.", tier: 3 },
  { id: "royal-adelaide", name: "Royal Adelaide Golf Club", place: "Seaton, South Australia", country: "Australia", lat: -34.905, lon: 138.513, clue: "A railway line once crossed the course; Alister MacKenzie remodelled it in 1926.", tier: 3 },
  { id: "lake-karrinyup", name: "Lake Karrinyup Country Club", place: "Karrinyup, Perth", country: "Australia", lat: -31.862, lon: 115.776, clue: "A wetland-fringed course near the far western edge of a continent.", tier: 3 },
  { id: "cape-kidnappers", name: "Cape Kidnappers", place: "Hawke's Bay", country: "New Zealand", lat: -39.635, lon: 177.045, clue: "Tom Doak's fairways run out along fingers of land 140 m above the Pacific.", tier: 2 },
  { id: "kauri-cliffs", name: "Kauri Cliffs", place: "Matauri Bay, Northland", country: "New Zealand", lat: -34.920, lon: 173.910, clue: "Clifftop holes overlooking the Cavalli Islands.", tier: 3 },
  { id: "tara-iti", name: "Tara Iti Golf Club", place: "Te Arai, Northland", country: "New Zealand", lat: -36.150, lon: 174.620, clue: "A Tom Doak design in sandy coastal dunes, opened in 2015.", tier: 3 },
  { id: "jacks-point", name: "Jack's Point", place: "Queenstown, Otago", country: "New Zealand", lat: -45.095, lon: 168.745, clue: "Lakeside holes beneath a jagged range called The Remarkables.", tier: 3 },
  { id: "natadola-bay", name: "Natadola Bay Golf Course", place: "Natadola, Viti Levu", country: "Fiji", lat: -18.105, lon: 177.315, clue: "A Vijay Singh design overlooking a South Pacific bay.", tier: 3 },
];
