// How the rating works, in the app's own words — the DUPR lesson: publish
// the math. Every number on this page is IMPORTED from @shuttle/rating;
// the math players read is the math that runs. rating-math.test.tsx pins
// displayed-equals-exported.
import { StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import {
  BASE_K,
  ELO_SCALE,
  INITIAL_RATING,
  PROVISIONAL_K,
  PROVISIONAL_MATCHES,
} from "@shuttle/rating";
import { color, font, size, space, tracking } from "../theme/tokens";
import { Button, Card, Screen } from "../components/ui";

export default function RatingMath() {
  return (
    <Screen testID="rating-math">
      <Card>
        <Text style={styles.title}>How the rating works</Text>
        <Text style={styles.copy}>
          Everyone starts at {INITIAL_RATING}. A win adds points to the winner and takes
          them from the loser. Nothing else moves your number.
        </Text>
      </Card>
      <Card>
        <Text style={styles.title}>How far it moves</Text>
        <Text style={styles.copy}>
          The step size is K. Yours is {BASE_K}. Your first {PROVISIONAL_MATCHES} rated
          games use {PROVISIONAL_K}, so you find your level fast.
        </Text>
        <Text style={styles.copy}>
          Upsets move more. The odds follow the Elo curve: a {ELO_SCALE}-point gap means
          about 10-to-1 expected odds.
        </Text>
        <Text style={styles.copy}>
          Winning big moves more. A blowout counts about twice a squeaker, never more.
        </Text>
      </Card>
      <Card>
        <Text style={styles.title}>Doubles</Text>
        <Text style={styles.copy}>
          You are rated against the opposing pair's average. Partners are scored one by
          one: at the same K, the stronger partner gains less from the same win.
        </Text>
      </Card>
      <Button
        label="Back"
        variant="quiet"
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/me"))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2, marginBottom: space.xs },
});
