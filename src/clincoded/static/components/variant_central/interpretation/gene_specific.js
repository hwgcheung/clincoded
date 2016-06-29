'use strict';
var React = require('react');
var _ = require('underscore');
var moment = require('moment');
var globals = require('../../globals');
var RestMixin = require('../../rest').RestMixin;

// Display the curator data of the curation data
var CurationInterpretationGeneSpecific = module.exports.CurationInterpretationGeneSpecific = React.createClass({
    mixins: [RestMixin],

    propTypes: {
        data: React.PropTypes.object,
        protocol: React.PropTypes.string
    },

    getInitialState: function() {
        return {
            clinvar_id: null
        };
    },

    render: function() {
        return (
            <div className="variant-interpretation gene-specific">
                <ul className="section-gene-specific-interpretation clearfix">
                    <li className="col-xs-12 gutter-exc">
                        <div>
                            <h4>Gene-specific Interpretation</h4>
                            <div>Gene-specific Data placeholder</div>
                        </div>
                    </li>
                </ul>
            </div>
        );
    }
});