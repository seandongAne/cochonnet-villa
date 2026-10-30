import { series } from './content.js';
import { SERIES_FRAME_SIZE, SERIES_SLOTS } from './one-more-episode.js';
import { CinemaSign, WallPoster, PosterViewer } from './MovieNight.jsx';

export function SeriesWall({ onSelect }) {
  return <group>
    <CinemaSign title="JUST ONE MORE EPISODE" size={[3.6, .22]} position={[0, 2.89, -2.31]} />
    {SERIES_SLOTS.map((slot) => <WallPoster key={slot.id} movie={series.find((show) => show.id === slot.id)} slot={slot} onSelect={onSelect} bounds={SERIES_FRAME_SIZE} labelOffset={-.65} labelSize={[1.42, .22]} />)}
  </group>;
}

export function SeriesViewer(props) {
  return <PosterViewer {...props} collection={series} heading="ONE MORE EPISODE" subtitle="And somehow, it was already 3 AM." returnLabel="Back to our sofa" dedication="The episode can wait. The seat next to you is my favorite part." mediaType="series title card" listLabel="Choose a television series" />;
}
