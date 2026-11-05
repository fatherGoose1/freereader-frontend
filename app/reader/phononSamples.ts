// Published, speaker-matched Phonon 31m samples. Pinned to the same Gradium
// revision that supplies the Gold catalogue embeddings on the backend.
const REVISION = "0ee17205f254b5abc43b266c8a0f215565c352f7";
const samples: Record<string, string> = {
  NbpkqMVS3CJeq2j8: "samples/en/en-us/female/1_zoey_NbpkqMVS3CJeq2j8.ogg",
  NIWIOv5vTi5eRMj8: "samples/en/en-us/female/2_juniper_NIWIOv5vTi5eRMj8.ogg",
  vjFyp2BcCyTlUmYb: "samples/en/en-us/female/3_everly_vjFyp2BcCyTlUmYb.ogg",
  "4SZHfMpw-p46Ywgs": "samples/en/en-us/female/4_harper_4SZHfMpw-p46Ywgs.ogg",
  bXwrkHhURL1VFJdG: "samples/en/en-us/female/5_hadley_bXwrkHhURL1VFJdG.ogg",
  nGzMHMPAWGaJFHOo: "samples/en/en-us/female/6_delia_nGzMHMPAWGaJFHOo.ogg",
  LMDIYE0Oa377Qh6Z: "samples/en/en-us/male/1_easton_LMDIYE0Oa377Qh6Z.ogg",
  "40QrMVgAxFiUnP9f": "samples/en/en-us/male/2_micah_40QrMVgAxFiUnP9f.ogg",
  "0zLApsZfVLLNaEGl": "samples/en/en-us/male/3_trevor_0zLApsZfVLLNaEGl.ogg",
  _6Aslh2DxfmnRLmP: "samples/en/en-us/male/4_russell__6Aslh2DxfmnRLmP.ogg",
  qIxlZ7Ei8KvWlyQH: "samples/en/en-us/male/5_preston_qIxlZ7Ei8KvWlyQH.ogg",
  d9XCyhjo4JhkHF1d: "samples/en/en-us/male/6_miles_d9XCyhjo4JhkHF1d.ogg",
  "6PWnV0Nq4wu7RVBT": "samples/en/en-gb/female/1_maeve_6PWnV0Nq4wu7RVBT.ogg",
  GgfEkEJtxZR7gnpy: "samples/en/en-gb/female/2_freya_GgfEkEJtxZR7gnpy.ogg",
  uem82D50GRv2Dwma: "samples/en/en-gb/female/3_pippa_uem82D50GRv2Dwma.ogg",
  y9bQqIDnyxwqK01t: "samples/en/en-gb/female/4_elodie_rose_y9bQqIDnyxwqK01t.ogg",
  "gDT1nz7Ie36ZhL-C": "samples/en/en-gb/female/5_imogen_gDT1nz7Ie36ZhL-C.ogg",
  m9MxpY6IUGXtWp76: "samples/en/en-gb/female/6_lottie_m9MxpY6IUGXtWp76.ogg",
  gfP44RlHwr2kEwk7: "samples/en/en-gb/female/7_bryony_gfP44RlHwr2kEwk7.ogg",
  X6NceqF285Gr04gb: "samples/en/en-gb/male/1_alfie_X6NceqF285Gr04gb.ogg",
  YyKcxPG7iIgS3jsK: "samples/en/en-gb/male/2_hugh_YyKcxPG7iIgS3jsK.ogg",
  zUCxzrOrugTSis03: "samples/en/en-gb/male/3_edwin_zUCxzrOrugTSis03.ogg",
  JOW0vchyswkQUMDS: "samples/en/en-gb/male/4_spencer_JOW0vchyswkQUMDS.ogg",
  dME3IWyZBvmh1n1q: "samples/en/en-gb/male/5_toby_dME3IWyZBvmh1n1q.ogg",
  Zn7g6NxLqXlJb7Qi: "samples/en/en-gb/male/6_teddy_Zn7g6NxLqXlJb7Qi.ogg",
  xPDpsV3F592srkjA: "samples/en/characters/captain_silas_blackwater_xPDpsV3F592srkjA.ogg",
  nOykTmcH9ydsGGIc: "samples/en/characters/morwenna_of_the_deep_nOykTmcH9ydsGGIc.ogg",
  lX3LavMNdlIbgEHH: "samples/en/characters/old_mortlake_lX3LavMNdlIbgEHH.ogg",
  dGyGDKo2osj7h3s7: "samples/en/characters/azgorath_dGyGDKo2osj7h3s7.ogg",
  cXoIXJ2llS8S0WOW: "samples/en/characters/fennick_the_young_elf_cXoIXJ2llS8S0WOW.ogg",
  GXaSqMEmOg12OIYb: "samples/en/characters/the_thing_under_the_stairs_GXaSqMEmOg12OIYb.ogg",
  xO8xQo3BrB8FuI6J: "samples/en/characters/vyrmathrax_the_ancient_xO8xQo3BrB8FuI6J.ogg",
  cYtsRSxV5q9IMehn: "samples/en/characters/grub_the_ogre_cYtsRSxV5q9IMehn.ogg",
  gSgG5Tor0GPEnqzC: "samples/en/characters/master_aldric_gSgG5Tor0GPEnqzC.ogg",
  NIWoEurJHMJjyUTe: "samples/en/characters/the_snow_queen_NIWoEurJHMJjyUTe.ogg",
  y2eiKxtQo2B67deU: "samples/en/characters/sir_bramwell_y2eiKxtQo2B67deU.ogg",
  QXNr0SvkukLB4wPq: "samples/en/characters/fairy_godmother_QXNr0SvkukLB4wPq.ogg",
};

export function phononSampleUrl(id: string): string | undefined {
  const path = Object.hasOwn(samples, id) ? samples[id] : undefined;
  return path && `/api/phonon-sample?id=${encodeURIComponent(id)}`;
}

export function phononSampleSourceUrl(id: string): string | undefined {
  const path = Object.hasOwn(samples, id) ? samples[id] : undefined;
  return path && `https://huggingface.co/gradium/phonon-voices/resolve/${REVISION}/${path}`;
}
