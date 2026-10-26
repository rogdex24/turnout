import { expect, test } from "bun:test";
import { inferArea } from "../src/catalog/area.js";

test("infers common Hyderabad areas from venue/address", () => {
  expect(inferArea("Some Cafe", "Road No 12, Banjara Hills")).toBe("banjara-hills");
  expect(inferArea("The Street Comedy Club: Hyderabad", "Madhapur, Hyderabad")).toBe("madhapur");
  expect(inferArea("Gachibowli Stadium", null)).toBe("gachibowli");
  expect(inferArea("HiTech City Arena", "HITEC City")).toBe("hitec-city");
  expect(inferArea("Mystery Venue", "Somewhere else")).toBe("other");
  expect(inferArea(null, null)).toBe("other");
});

test("maps live other-sample venues and addresses into real areas", () => {
  // District often ships Red Rhino with no address
  expect(inferArea("Red Rhino - Craft Brewery and Inspired Kitchen", null)).toBe("gachibowli");
  expect(
    inferArea(
      "HITEX Exhibition Center: Hyderabad",
      "Trade Fair, Office Building Hitex Exhibition Centre, Izzat Nagar, Kothaguda, Hyderabad",
    ),
  ).toBe("hitec-city");
  expect(inferArea("Hitex Hall 4", "HICC, Novotel Hotel Rd, Izzathnagar")).toBe("hitec-city");
  expect(
    inferArea("Third Wave Coffee, Knowledge City: Hyderabad", "Knowledge City, Salarpuria Sattva, Raidurg Village, Serilingampalle (M)"),
  ).toBe("hitec-city");
  expect(inferArea("Mindspace Social: Hyderabad", "Raheja IT Park, Mindspace Junction Flyover")).toBe("madhapur");
  expect(inferArea("Smaaash Hyderabad", null)).toBe("madhapur");
  expect(inferArea("Raichandani Business Bay: Hyderabad", "7-90/5, Gandipet Main Road, Manchirevula, Hyderabad")).toBe("kokapet");
  expect(
    inferArea("KLN Prasad Auditorium - FTCCI: Hyderabad", "11-6-841, FTCCI Marg, Lakdikapul Rd, Hari Nagar, Red Hills, Hyderabad"),
  ).toBe("khairatabad");
  expect(inferArea("Bhaskara Auditorium", "Ambedkar Colony, Khairtabad, Hyderabad")).toBe("khairatabad");
  expect(inferArea("SAS iTower: Hyderabad", "Khajaguda, Makthakousarali")).toBe("financial-district");
  expect(inferArea("Artillery Centre: Hyderabad", "Artillery Centre, Golconda, Hyderabad")).toBe("mehdipatnam");
  expect(inferArea("Nexus Hyderabad Mall", "KPHB PHASE VI, Hyderabad")).toBe("kukatpally");
  expect(inferArea("Indian School of Business ,Hyderabad", "ISB Road")).toBe("gachibowli");
  expect(inferArea("Hotel Katriya", "8 Raj Bhavan Road")).toBe("somajiguda");
  expect(inferArea("Hotel Deccan Serai Grande", "Plot No: 25 42, 44")).toBe("gachibowli");
  expect(inferArea("La Vie En Rose Cafe", "Saroornagar, Kothapet, Hyderabad")).toBe("lb-nagar");
  expect(inferArea("Ashikins Studio - Jam Room", "behind ESI Bus Stop, BK Guda, Sanjeeva Reddy Nagar")).toBe("ameerpet");
  expect(inferArea("Begum Bazar", "Begum Bazar, Afzal Gunj, Hyderabad")).toBe("old-city");
});

test("keeps TBA / online / bare city as other", () => {
  expect(inferArea("Venue To Be Announced: Hyderabad", "Hyderabad, Telangana India")).toBe("other");
  expect(inferArea("Online", null)).toBe("other");
  expect(inferArea("Hyderabad", "Hyderabad")).toBe("other");
  expect(inferArea(null, "Hyderabad")).toBe("other");
});

test("does not let Serilingampalle / Hitech tokens steal clearer neighbourhoods", () => {
  expect(inferArea("Starbucks, Gachibowli: Hyderabad", "Jayabheri Enclave, Gachibowli, Serilingampalle (M), Hyderabad")).toBe("gachibowli");
  expect(inferArea("Smaaash, Inorbit Mall: Hyderabad", "Inorbit Mall Hitech City, Madhapur, Hyderabad")).toBe("madhapur");
  expect(inferArea("Vault Brewery: Hyderabad", "Near Metro Station Madhapur, Jubilee Hills, Hyderabad")).toBe("jubilee-hills");
});
