import { View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { meet as copy } from "@/copy/meet";
import { mapRegion } from "@/model/meetCard";
import type { Point } from "@/model/walk";

export interface MeetMapProps {
  cafe: { name: string; point: Point };
  venue: { name: string | null; point: Point } | null;
  /** The map's accessible name. */
  label: string;
}

/**
 * The real map: two pins, the cafe and the venue. It is a still picture (lite mode on Android) and does not take touches, so the card
 * scrolls over it. The person's own position is never drawn on it: the walk line is worked out on the phone and written as words.
 */
export function MeetMap({ cafe, venue, label }: MeetMapProps) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="h-28 overflow-hidden" testID="meet-map">
      <MapView
        style={{ flex: 1 }}
        initialRegion={mapRegion(cafe.point, venue?.point ?? null)}
        liteMode
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        pointerEvents="none"
      >
        <Marker coordinate={{ latitude: cafe.point.lat, longitude: cafe.point.lng }} title={cafe.name} />
        {venue ? (
          <Marker coordinate={{ latitude: venue.point.lat, longitude: venue.point.lng }} title={venue.name ?? copy.map.venue} />
        ) : null}
      </MapView>
    </View>
  );
}
