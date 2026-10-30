import { vinylRecords, VINYL_SIZE, VINYL_SLOTS } from './vinyl-records.js';
import { musicals } from './content.js';
import { MUSICAL_POSTER_SIZE, MUSICAL_POSTER_SLOTS } from './music-world.js';
import { CinemaSign, WallPoster, PosterViewer } from './MovieNight.jsx';

export function MusicalPosters({ onSelect }) {
  return <group>
    {MUSICAL_POSTER_SLOTS.map((slot) => <WallPoster key={slot.id} movie={musicals.find((item) => item.id === slot.id)} slot={slot} onSelect={onSelect} bounds={MUSICAL_POSTER_SIZE} labelOffset={.69} labelSize={[.96, .17]} />)}
    {VINYL_SLOTS.map((slot) => <WallPoster key={slot.id} movie={vinylRecords.find((item) => item.id === slot.id)} slot={slot} onSelect={onSelect} bounds={VINYL_SIZE} labelOffset={-.62} labelSize={[1.02, .16]} />)}
    <CinemaSign title="OUR VINYL COLLECTION" size={[2.2, .18]} position={[2.8, 2.8, 0]} rotation={[0, -Math.PI / 2, 0]} />
  </group>;
}

export function MusicalPosterViewer(props) {
  if (vinylRecords.some((item) => item.id === props.initialId)) {
    return <PosterViewer {...props} collection={vinylRecords} heading="OUR VINYL COLLECTION" subtitle="The records we collect together." returnLabel="Back to The Encore" dedication="A little piece of our collection, always waiting for another spin." mediaType="vinyl record" listLabel="Choose a vinyl record" />;
  }
  return <PosterViewer {...props} collection={musicals} heading="THE ENCORE" subtitle="The stories we sang along to." returnLabel="Back to The Encore" dedication="For every curtain call we shared, and every record still waiting for another spin." mediaType="musical" listLabel="Choose a musical" />;
}
