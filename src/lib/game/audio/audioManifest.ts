// src/lib/game/audio/audioManifest.ts
//
// The game's audio manifest — add every audio asset here.
//
// ── Adding BGM tracks ─────────────────────────────────────────────────────────
//   1. Drop your .ogg file into  static/audio/music/
//   2. Add its path to the relevant playlist's `tracks` array below.
//
// ── Adding SFX ────────────────────────────────────────────────────────────────
//   1. Drop your .ogg file(s) into  static/audio/sfx/
//   2. Add an entry to the `sfx` map (dot-notation id → SFXConfig).
//   3. Trigger it via  audio.sfx.play('your.sound.id')  in AudioModule.handleEvents().

import type { AudioManifest } from './AudioTypes';

export const AUDIO_MANIFEST: AudioManifest = {
  music: {
    defaultPlaylist: 'main',
    playlists: {

      main: {
        tracks: [
          '/audio/music/track_01_a_simple_snail.ogg',
          '/audio/music/track_02_leapfrogs.ogg',
          '/audio/music/track_03_frolicking.ogg',
          '/audio/music/track_04_guinea_pig_jig.ogg',
          '/audio/music/track_05_being_big.ogg',
          '/audio/music/track_06_squeaky_wagon.ogg',
          '/audio/music/track_07_hungry.ogg',
          '/audio/music/track_08_the_fanciest_mud.ogg',
          '/audio/music/track_09_a_friend_to_stand_on.ogg',
          '/audio/music/track_10_the_answer_is_yes.ogg',
          '/audio/music/track_11_woof_over_my_head.ogg',
          '/audio/music/track_12_good_king.ogg',
          '/audio/music/track_13_loopy.ogg',
          '/audio/music/track_14_life_is_hard.ogg',
          '/audio/music/track_15_something_in_my_eye.ogg',
          '/audio/music/track_16_cloak_of_darkness.ogg',
          '/audio/music/track_17_no_time_for_turnips.ogg',
          '/audio/music/track_18_purrspective.ogg',
          '/audio/music/track_19_triangles_of_time.ogg',
          '/audio/music/track_20_long_lonely_road.ogg',
          '/audio/music/track_21_new_tricks.ogg',
          '/audio/music/track_22_opposable_thumbs.ogg',
          '/audio/music/track_23_soldiers_lament.ogg',
          '/audio/music/track_24_royal_blue.ogg',
          '/audio/music/track_25_deep_dark_sea.ogg',
          '/audio/music/track_26_sorcerers_spell.ogg',
          '/audio/music/track_27_heartstrings.ogg',
          '/audio/music/track_28_quaint_questions.ogg',
          '/audio/music/track_29_hare_raising_tale.ogg',
          '/audio/music/track_30_bandits_ballad.ogg',
          '/audio/music/track_31_thinking_back.ogg',
          '/audio/music/track_32_perserverance.ogg',
          '/audio/music/track_33_bashful.ogg',
          '/audio/music/track_34_prickly_hugs.ogg',
          '/audio/music/track_35_lambicorn.ogg',
          '/audio/music/track_36_end_of_the_rainbow.ogg',
          '/audio/music/track_37_weight_of_the_crown.ogg',
          '/audio/music/track_38_lionheart.ogg',
          '/audio/music/track_39_flightless_dragon.ogg',
          '/audio/music/track_40_in_my_shell.ogg',
          '/audio/music/track_41_firecat.ogg',
          '/audio/music/track_42_round_and_round.ogg',
          '/audio/music/track_43_a_quest_for_treats.ogg',
          '/audio/music/track_44_lucky_rabbit.ogg',
          '/audio/music/track_45_esoteric_waterfowl.ogg',
          '/audio/music/track_46_boars_day_out.ogg',
          '/audio/music/track_47_hoof_it.ogg',
          '/audio/music/track_48_defender_of_the_clouds.ogg',
          '/audio/music/track_49_galileos_revalation.ogg',
          '/audio/music/track_50_queens_march.ogg',
          '/audio/music/track_51_height_of_power.ogg',
          '/audio/music/track_52_the_firey_depths.ogg',
          '/audio/music/track_53_a_screw_loose.ogg',
          '/audio/music/track_54_infinity.ogg',
        ],
        mode: 'shuffle',
        crossfadeDuration: 0,
      },
    },
  },

  sfx: {
    // 'footstep.stone': { variants: ['/audio/sfx/footstep_stone_001.ogg', ...] },
    'footstep.carpet': {
      variants: [
        '/audio/sfx/footstep_carpet_001.ogg',
        '/audio/sfx/footstep_carpet_002.ogg',
        '/audio/sfx/footstep_carpet_003.ogg',
        '/audio/sfx/footstep_carpet_004.ogg',
        '/audio/sfx/footstep_carpet_005.ogg',
        '/audio/sfx/footstep_carpet_006.ogg',
        '/audio/sfx/footstep_carpet_007.ogg',
        '/audio/sfx/footstep_carpet_008.ogg',
        '/audio/sfx/footstep_carpet_009.ogg',
        '/audio/sfx/footstep_carpet_010.ogg',
        '/audio/sfx/footstep_carpet_011.ogg',
        '/audio/sfx/footstep_carpet_012.ogg',
        '/audio/sfx/footstep_carpet_013.ogg',
        '/audio/sfx/footstep_carpet_014.ogg',
        '/audio/sfx/footstep_carpet_015.ogg',
        '/audio/sfx/footstep_carpet_016.ogg',
        '/audio/sfx/footstep_carpet_017.ogg',
        '/audio/sfx/footstep_carpet_018.ogg',
        '/audio/sfx/footstep_carpet_019.ogg',
        '/audio/sfx/footstep_carpet_020.ogg',
        '/audio/sfx/footstep_carpet_021.ogg',
      ],
    },
  },
};
