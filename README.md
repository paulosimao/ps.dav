##ps.dav
This is my implementation of a DAV Server. The goal is to change it later to a more modular and event based approach.
This initial version focuses on having a first version that complies to DAV Standards.

The design is very simple at the moment:
* There is davserver, that implements the webserver and facade for DAV Services
* There is mongohandler, which is an implementation of the facade working (too tight at the moment) with a mongodb implementation.

Once this is has been tested, some refactoring will be applied to provide modularity and alignment with Javascript best practices.

Please dont blame me, test scripts are not there yet.