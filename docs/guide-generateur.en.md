# KJP harbour generator

Build a navigable harbour for KJP Port Simulator. Controls, properties, messages and this guide follow the language chosen in the FR / EN / Bzh selector. Your preference is saved on this device; switching language preserves the harbour and its author’s text.

## Locate and reconstruct

The editor works offline. Enable online maps to use OpenStreetMap, OpenSeaMap and IGN satellite imagery. Search for a place or enter its coordinates. Adjust satellite opacity to check your drawings.

Zoom to an area no larger than 2 × 2 km. Analyse the visible area or draw a polygon. Proposed objects remain candidates: check their category and geometry, then integrate your selection. A pontoon decomposition preview may be offered before confirmation.

## Build and adjust

Choose a tool in the side rail, then click or draw on the map. Select an object to adjust its dimensions, position and orientation. Distances are in metres. For an entrance, nautical heading is 0° north and 90° east.

Clicking another element adds it to the selection. Click a selected element to
remove it, or empty space to clear the selection. **Delete** removes the whole
selection in one operation. Elements of the same type share editable properties;
**Different values** means the entered value will apply to all of them. Finger
pontoons edited together are detached from their series. **Undo** restores the
whole operation. Keep one object selected to move it or use its handles.

To add a pontoon, click its two endpoints. Drag its body to move it, or drag either endpoint freely to adjust its length and orientation while keeping the other endpoint fixed.

Choose **Measure**, then click two map points, including on the satellite layer. The distance remains visible in metres. To measure finger spacing, pick the same reference on two adjacent fingers, such as their centreline. With a pontoon selected, **Use as spacing** copies the measurement into the series settings; create the series when ready. Clear removes the measurement, and Escape cancels a measurement in progress. Measurements are excluded from KJP exports.

A pontoon can generate a series of finger pontoons. Edit the whole series or detach a finger to adjust it individually. Select a pontoon or quay to create lazy line berths. Advanced settings specify the mooring anchor distance and depth. Buoys offer OpenSeaMap categories and shapes.

Compute berths, mark visitor berths and set occupancy before placing boats. Undo and Redo preserve editing history. Shortcuts: V to select, D to duplicate, Delete to delete, Ctrl/⌘ Z to undo and Ctrl/⌘ Shift Z to redo.

To add a berth manually, set its width and length under **Berths and surroundings**,
choose **Berth**, then click in the water near a pontoon, finger pontoon or quay.
Move it or edit its angle and dimensions in the properties. Clearance checks may
shorten it. Manual berths survive automatic recalculation and saving to KJP.

## Save, import and export

The draft is saved locally when browser storage is available. New harbour replaces the draft after confirmation. Fill in the harbour name, author and sources. This information and imported names are preserved in their original language.

Choose **Open**, then **Choose a .kjp file** to resume editing a local harbour. Choose **Save**, then **Download the .kjp file** to obtain a validated KJP file for the simulator. If an object prevents export, Show object selects it for correction. Maps are never included in the KJP file.

The **Public library · Community** section also opens harbours stored on pCloud.
The generator can publish there from a local HTML file or any hosting: choose **Save**, then **Save to
the library**, with no pCloud account or sign-in required. If the harbour already
exists, confirm publishing an update or cancel. The library shows the latest
version, while pCloud keeps previous uploads. A catalogue accompanies each harbour, and the simulator
lists it as **Community**. The **KJP** editor library remains in GitHub and is
not accessible from the generator.

## Project and versions

Release 2.1 versions: generator 1.1.0, KJP schema 3. A project by Arnaud de Moissac, distributed under the Apache 2.0 licence. Contact: kjp.bzh@gmail.com.

[Open the simulator](https://arnaud2moissac.github.io/KJP_Port_Simulator/simulateur-port.html) · [Full project information — French content](https://github.com/arnaud2moissac/KJP_Port_Simulator/blob/main/README.md) · [Apache 2.0 licence](https://github.com/arnaud2moissac/KJP_Port_Simulator/blob/main/LICENSE)
