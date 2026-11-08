export type Route={id:string;mode:string;distance:number|null;duration:number|null;walkingDistance:number|null;transfers:number;steps:string[];legs?:{kind:string;name:string;from:string;to:string}[]};
export type Place={id:string;name:string;address:string;location:string};
export type Routes={routes:Route[];source:string;queriedAt:string;notice:string;warnings:string[];ranking:string;departure:string};
export type TripContext={city:string;origin?:string;destination?:string;originName?:string;destinationName?:string;preferences:string[];departure:string;needs:string};
