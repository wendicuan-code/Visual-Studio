import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { extractPropertyFacts } from "../shared/edit-brief";
import {
  AspectRatio,
  computeTimeline,
  getMusicEffectiveVolumeAtSec,
  getSceneCompositionForAspect,
  mapSourceSubtitlesToTimeline,
  MediaItem,
  Project,
  SceneItem,
} from "../shared/model";

export interface StudioVideoProps {
  project: Project;
  mediaMap: Record<string, MediaItem>;
  showSafeArea?: boolean;
}

const SceneVisual: React.FC<{
  scene: SceneItem;
  aspectRatio: AspectRatio;
  media: MediaItem | undefined;
  durationInFrames: number;
  overlapInFrames: number;
  designScale: number;
}> = ({
  scene,
  aspectRatio,
  media,
  durationInFrames,
  overlapInFrames,
  designScale,
}) => {
  const frame = useCurrentFrame();
  const safeDuration = Math.max(1, durationInFrames);
  const comp = getSceneCompositionForAspect(scene, aspectRatio);

  let motionScale = 1;
  let translateX = comp.positionX * 1.6 * designScale;
  const translateY = comp.positionY * 1.6 * designScale;

  if (scene.motion === "zoom-in") {
    motionScale = interpolate(frame, [0, safeDuration], [1, 1.12], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (scene.motion === "zoom-out") {
    motionScale = interpolate(frame, [0, safeDuration], [1.12, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else if (scene.motion === "pan-left") {
    motionScale = 1.08;
    translateX += interpolate(
      frame,
      [0, safeDuration],
      [24 * designScale, -24 * designScale],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  } else if (scene.motion === "pan-right") {
    motionScale = 1.08;
    translateX += interpolate(
      frame,
      [0, safeDuration],
      [-24 * designScale, 24 * designScale],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  }

  const finalScale = Number(((comp.zoomScale || 1) * motionScale).toFixed(4));

  let opacity = 1;
  let slideOffsetPx = 0;
  let wipePercent = 100;

  if (overlapInFrames > 0 && scene.transitionIn !== "none") {
    if (scene.transitionIn === "fade") {
      opacity = interpolate(frame, [0, overlapInFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    } else if (scene.transitionIn === "slide") {
      slideOffsetPx = interpolate(
        frame,
        [0, overlapInFrames],
        [180 * designScale, 0],
        {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      );
      opacity = interpolate(frame, [0, overlapInFrames], [0.25, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    } else if (scene.transitionIn === "wipe") {
      wipePercent = interpolate(frame, [0, overlapInFrames], [0, 100], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }

  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: comp.fitMode,
    transform: `translate(${translateX}px, ${translateY}px) scale(${finalScale})`,
  };

  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateX(${slideOffsetPx}px)`,
        clipPath:
          scene.transitionIn === "wipe" && overlapInFrames > 0
            ? `inset(0 ${100 - wipePercent}% 0 0)`
            : undefined,
        backgroundColor: "#071324",
        overflow: "hidden",
      }}
    >
      {media ? (
        scene.kind === "video" ? (
          <OffthreadVideo
            src={media.url}
            style={mediaStyle}
            volume={scene.muted ? 0 : scene.volume}
          />
        ) : (
          <Img src={media.url} style={mediaStyle} />
        )
      ) : (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#0f243c",
            color: "#94a3b8",
            fontSize: Math.round(28 * designScale),
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }}
        >
          Media Adegan Tidak Ditemukan
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export const StudioVideo: React.FC<StudioVideoProps> = ({
  project,
  mediaMap,
  showSafeArea = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Koordinat desain berbasis 1080 agar ukuran teks/crop konsisten pada 720p dan 1080p
  const designScale = Math.min(width, height) / 1080;

  const timeline = computeTimeline(project, fps);
  const currentTimeSec = frame / fps;

  const activeSceneTiming =
    [...timeline.scenes]
      .reverse()
      .find((st) => frame >= st.startFrame && frame <= st.endFrame) ??
    timeline.scenes[0];

  const activeScene = activeSceneTiming
    ? project.scenes[activeSceneTiming.index]
    : undefined;

  const mappedSubtitles = mapSourceSubtitlesToTimeline(project, fps);
  const activeCue = mappedSubtitles.find(
    (c) =>
      !c.hidden &&
      currentTimeSec >= c.startSec &&
      currentTimeSec <= c.endSec,
  );

  const showContact =
    project.logoContact.contactDisplay === "always" ||
    currentTimeSec >= Math.max(0, timeline.totalDurationSec - 3);

  const logoMedia = project.logoContact.logoMediaId
    ? mediaMap[project.logoContact.logoMediaId]
    : undefined;

  const musicMedia = project.musicTrack.mediaId
    ? mediaMap[project.musicTrack.mediaId]
    : undefined;

  const voiceoverMedia = project.voiceoverTrack.mediaId
    ? mediaMap[project.voiceoverTrack.mediaId]
    : undefined;

  const extractedFacts = extractPropertyFacts(project.unitDescription);
  const effectivePriceText =
    project.textStyle.priceBadgeText?.trim() || extractedFacts.hargaRp || "";
  const priceScale = project.textStyle.priceFontScale || 1.0;

  const subStyle = project.subtitleStyle ?? {
    fontFamily: "Plus Jakarta Sans",
    fontSize: 28,
    position: "bottom" as const,
    textColor: "#FFFFFF",
    highlightColor: project.textStyle.accentColor,
    outlineColor: "#040C18",
    bgOpacity: 0.86,
  };

  const textPosJustify =
    project.textStyle.position === "top"
      ? "flex-start"
      : project.textStyle.position === "center"
        ? "center"
        : "flex-end";

  const logoPosStyle: React.CSSProperties = {
    position: "absolute",
    zIndex: 20,
    top: project.logoContact.logoPosition.startsWith("top")
      ? Math.round(42 * designScale)
      : undefined,
    bottom: project.logoContact.logoPosition.startsWith("bottom")
      ? Math.round(230 * designScale)
      : undefined,
    left: project.logoContact.logoPosition.endsWith("left")
      ? Math.round(44 * designScale)
      : undefined,
    right: project.logoContact.logoPosition.endsWith("right")
      ? Math.round(44 * designScale)
      : undefined,
    opacity: project.logoContact.logoOpacity,
  };

  const subtitleBottomPx =
    subStyle.position === "top"
      ? undefined
      : subStyle.position === "middle"
        ? Math.round(height * 0.46)
        : showContact
          ? Math.round(345 * designScale)
          : Math.round(225 * designScale);

  const subtitleTopPx =
    subStyle.position === "top" ? Math.round(135 * designScale) : undefined;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#06101e",
        fontFamily: `${project.textStyle.fontFamily}, sans-serif`,
      }}
    >
      {/* Lapisan Adegan Visual */}
      {timeline.scenes.map((st) => {
        const sc = project.scenes[st.index];
        if (!sc) return null;
        return (
          <Sequence
            key={sc.id}
            from={st.startFrame}
            durationInFrames={st.clipFrames}
          >
            <SceneVisual
              scene={sc}
              aspectRatio={project.aspectRatio}
              media={mediaMap[sc.mediaId]}
              durationInFrames={st.clipFrames}
              overlapInFrames={st.overlapInFrames}
              designScale={designScale}
            />
          </Sequence>
        );
      })}

      {/* Audio Musik dengan Ducking & Fade */}
      {musicMedia && (
        <Sequence
          from={Math.round(project.musicTrack.startSec * fps)}
          durationInFrames={Math.max(
            1,
            timeline.totalFrames -
              Math.round(project.musicTrack.startSec * fps),
          )}
        >
          <Audio
            src={musicMedia.url}
            loop={project.musicTrack.loop}
            volume={(f) => {
              const globalSec = project.musicTrack.startSec + f / fps;
              return getMusicEffectiveVolumeAtSec(
                project.musicTrack,
                timeline.duckIntervals,
                globalSec,
                timeline.totalDurationSec,
              );
            }}
          />
        </Sequence>
      )}

      {/* Audio Voice-over */}
      {voiceoverMedia && (
        <Sequence
          from={Math.round(project.voiceoverTrack.startSec * fps)}
          durationInFrames={Math.max(
            1,
            timeline.totalFrames -
              Math.round(project.voiceoverTrack.startSec * fps),
          )}
        >
          <Audio
            src={voiceoverMedia.url}
            loop={project.voiceoverTrack.loop}
            volume={project.voiceoverTrack.volume}
          />
        </Sequence>
      )}

      {/* Scrim Kontras untuk Keterbacaan Teks */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(4,12,24,0.88) 0%, rgba(4,12,24,0.34) 44%, rgba(4,12,24,0.18) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Watermark Logo */}
      {logoMedia && (
        <div style={logoPosStyle}>
          <Img
            src={logoMedia.url}
            style={{
              width: Math.round(
                114 * project.logoContact.logoScale * designScale,
              ),
              height: Math.round(
                76 * project.logoContact.logoScale * designScale,
              ),
              objectFit: "contain",
            }}
          />
        </div>
      )}

      {/* Badge Harga Properti (Dapat Diperbesar lewat Kontrol / Asisten AI) */}
      {project.textStyle.showPriceBadge && effectivePriceText && (
        <div
          style={{
            position: "absolute",
            top: Math.round(44 * designScale),
            left: Math.round(44 * designScale),
            zIndex: 24,
            backgroundColor: "rgba(8, 23, 43, 0.92)",
            border: `2px solid ${project.textStyle.accentColor}`,
            borderRadius: Math.round(14 * designScale),
            padding: `${Math.round(10 * priceScale * designScale)}px ${Math.round(18 * priceScale * designScale)}px`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: Math.round(16 * priceScale * designScale),
              color: "#CBD5E1",
              fontWeight: 600,
            }}
          >
            Harga Penawaran Resmi
          </div>
          <div
            style={{
              fontSize: Math.round(28 * priceScale * designScale),
              color: project.textStyle.accentColor,
              fontWeight: 800,
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {effectivePriceText}
          </div>
        </div>
      )}

      {/* Kicker Judul, Label Ruangan & Teks Adegan */}
      {activeScene && (activeScene.title || activeScene.bodyText) && (
        <AbsoluteFill
          style={{
            justifyContent: textPosJustify,
            paddingTop: Math.round(150 * designScale),
            paddingLeft: Math.round(52 * designScale),
            paddingRight: Math.round(52 * designScale),
            paddingBottom: showContact
              ? Math.round(450 * designScale)
              : Math.round(320 * designScale),
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              backgroundColor: `rgba(8, 23, 43, ${project.textStyle.bgOpacity})`,
              border: "1px solid rgba(255, 255, 255, 0.16)",
              borderRadius: Math.round(18 * designScale),
              padding: `${Math.round(22 * designScale)}px ${Math.round(28 * designScale)}px`,
              maxWidth: "94%",
            }}
          >
            {(activeScene.roomLabel || activeScene.title) && (
              <div
                style={{
                  color: project.textStyle.accentColor,
                  fontSize: Math.round(24 * designScale),
                  fontWeight: 700,
                  marginBottom: Math.round(6 * designScale),
                  letterSpacing: "0.01em",
                }}
              >
                {activeScene.roomLabel
                  ? `${activeScene.roomLabel} · ${activeScene.title}`
                  : activeScene.title}
              </div>
            )}
            {activeScene.bodyText && (
              <div
                style={{
                  color: project.textStyle.textColor,
                  fontSize: Math.round(32 * designScale),
                  fontWeight: 700,
                  lineHeight: 1.28,
                }}
              >
                {activeScene.bodyText}
              </div>
            )}
          </div>
        </AbsoluteFill>
      )}

      {/* Subtitle Aktif dengan Pengaturan Font/Ukuran/Outline & Highlight Kata */}
      {project.subtitleBurnIn && activeCue && (
        <div
          style={{
            position: "absolute",
            left: Math.round(48 * designScale),
            right: Math.round(48 * designScale),
            bottom: subtitleBottomPx,
            top: subtitleTopPx,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 25,
          }}
        >
          <div
            style={{
              backgroundColor: `rgba(5, 13, 26, ${subStyle.bgOpacity})`,
              color: subStyle.textColor,
              fontFamily: `${subStyle.fontFamily}, sans-serif`,
              padding: `${Math.round(12 * designScale)}px ${Math.round(22 * designScale)}px`,
              borderRadius: Math.round(12 * designScale),
              fontSize: Math.round(subStyle.fontSize * designScale),
              fontWeight: 600,
              textAlign: "center",
              lineHeight: 1.35,
              border: "1px solid rgba(255,255,255,0.16)",
              textShadow: `0 2px 4px ${subStyle.outlineColor}, 0 0 2px ${subStyle.outlineColor}`,
            }}
          >
            {activeCue.words && activeCue.words.length > 0 ? (
              activeCue.words.map((w, idx) => {
                const isCurrentWord =
                  currentTimeSec >= w.startSec && currentTimeSec <= w.endSec;
                return (
                  <span
                    key={`${w.word}-${idx}`}
                    style={{
                      color: isCurrentWord
                        ? subStyle.highlightColor
                        : subStyle.textColor,
                      marginRight: Math.round(8 * designScale),
                    }}
                  >
                    {w.word}
                  </span>
                );
              })
            ) : (
              <span>{activeCue.text}</span>
            )}
          </div>
        </div>
      )}

      {/* Banner Kontak Agen */}
      {showContact &&
        (project.logoContact.agentName ||
          project.logoContact.phone ||
          project.logoContact.whatsapp) && (
          <div
            style={{
              position: "absolute",
              left: Math.round(44 * designScale),
              right: Math.round(44 * designScale),
              bottom: Math.round(220 * designScale),
              backgroundColor: "rgba(8, 27, 50, 0.94)",
              border: `1px solid ${project.textStyle.accentColor}`,
              borderRadius: Math.round(14 * designScale),
              padding: `${Math.round(14 * designScale)}px ${Math.round(22 * designScale)}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#F8FAFC",
              zIndex: 30,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: Math.round(23 * designScale),
                  fontWeight: 700,
                  color: project.textStyle.accentColor,
                }}
              >
                {project.logoContact.agentName || "Konsultan Properti Batam"}
              </div>
              {project.logoContact.agency && (
                <div
                  style={{
                    fontSize: Math.round(18 * designScale),
                    color: "#CBD5E1",
                  }}
                >
                  {project.logoContact.agency}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: Math.round(23 * designScale),
                  fontWeight: 700,
                  fontFamily: "JetBrains Mono, monospace",
                }}
              >
                {project.logoContact.whatsapp || project.logoContact.phone}
              </div>
              <div
                style={{
                  fontSize: Math.round(16 * designScale),
                  color: "#94A3B8",
                }}
              >
                Hubungi untuk jadwal survei unit
              </div>
            </div>
          </div>
        )}

      {/* Safe Area Guide Overlay (Untuk pemeriksaan margin aman di Player) */}
      {showSafeArea && (
        <AbsoluteFill
          style={{
            border: `${Math.max(2, Math.round(3 * designScale))}px dashed rgba(56, 189, 248, 0.75)`,
            margin: `${Math.round(height * 0.08)}px ${Math.round(width * 0.06)}px ${Math.round(height * 0.14)}px`,
            borderRadius: Math.round(12 * designScale),
            pointerEvents: "none",
            zIndex: 45,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
