# node-red-contrib-focas

Node-RED node designed for reading data from a Fanuc CNC. 

This node was designed by [ST-One](https://st-one.io). It depends on the `node-focas` library that is currently only available bundled on the [ST-One hardware](https://st-one.io/st-one).

The list below contains all functions currently supported by the node.
- **System Info:** Reads status information of CNC
- **Status Info:** Reads system information such as kind of CNC system, Machining(M) or Turning(T), series and version of CNC system software and number of controlled axes.
- **Timers:** Gets cutting time, cycle time, and other timer data of CNC.
- **Axes Data:** Reads various data related to servo axis/spindle axis.
- **Parameters:** Reads the parameter specified.
- **Program Number:** Reads program number of the program that is currently being selected on the CNC.
- **Sample Data:** Samples data from CNC.
- **Alarm Messages:** Reads currently active CNC alarm messages.


























