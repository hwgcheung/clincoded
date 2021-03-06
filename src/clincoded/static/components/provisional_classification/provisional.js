'use strict';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import createReactClass from 'create-react-class';
import moment from 'moment';
import { RestMixin } from '../rest';
import { Form, FormMixin, Input } from '../../libs/bootstrap/form';
import { getAffiliationName } from '../../libs/get_affiliation_name';
import DayPickerInput from 'react-day-picker/DayPickerInput';
import MomentLocaleUtils, { formatDate, parseDate } from 'react-day-picker/moment';
import * as CuratorHistory from '../curator_history';
import * as curator from '../curator';
const CurationMixin = curator.CurationMixin;

const ProvisionalApproval = module.exports.ProvisionalApproval = createReactClass({
    mixins: [RestMixin, FormMixin, CurationMixin, CuratorHistory],

    propTypes: {
        gdm: PropTypes.object,
        interpretation: PropTypes.object,
        session: PropTypes.object,
        provisional: PropTypes.object,
        classification: PropTypes.string,
        classificationStatus: PropTypes.string,
        affiliation: PropTypes.object, // User's affiliation
        updateSnapshotList: PropTypes.func,
        updateProvisionalObj: PropTypes.func,
        approveProvisional: PropTypes.func
    },

    getInitialState() {
        return {
            provisionalDate: this.props.provisional && this.props.provisional.provisionalDate ? this.props.provisional.provisionalDate : undefined,
            provisionalReviewDate: this.props.provisional && this.props.provisional.provisionalReviewDate ? this.props.provisional.provisionalReviewDate : undefined,
            provisionalComment: this.props.provisional && this.props.provisional.provisionalComment ? this.props.provisional.provisionalComment : undefined,
            provisionalSubmitter: this.props.provisional && this.props.provisional.provisionalSubmitter ? this.props.provisional.provisionalSubmitter : undefined,
            isProvisionalPreview: this.props.provisional && this.props.provisional.classificationStatus === 'Provisional' ? true : false,
            isProvisionalEdit: false,
            submitBusy: false // Flag to indicate that the submit button is in a 'busy' state
        };
    },

    componentWillReceiveProps(nextProps) {
        if (this.props.interpretation && Object.keys(this.props.interpretation).length) {
            if (nextProps.provisional) {
                this.setState({
                    provisionalDate: nextProps.provisional.provisionalDate,
                    provisionalReviewDate: nextProps.provisional.provisionalReviewDate,
                    provisionalComment: nextProps.provisional.provisionalComment,
                    provisionalSubmitter: nextProps.provisional.provisionalSubmitter,
                    isProvisionalPreview: nextProps.provisional && nextProps.provisional.classificationStatus === 'Provisional' ? true : false,
                });
            }
        }
    },

    handleProvisionalReviewDateChange(provisionalReviewDate) {
        this.setState({provisionalReviewDate});
    },

    /**
     * Method to handle previewing provisional form data
     */
    handlePreviewProvisional() {
        const provisionalComment = this.provisionalCommentInput.getValue();
        this.setState({
            provisionalSubmitter: this.props.session.user_properties.title,
            provisionalComment: provisionalComment.length ? provisionalComment : undefined
        }, () => {
            this.setState({isProvisionalPreview: true});
        });
    },

    /**
     * Method to handle resetting the provisional form data
     */
    handleCancelProvisional() {
        this.setState({
            provisionalSubmitter: this.props.provisional && this.props.provisional.provisionalSubmitter ? this.props.provisional.provisionalSubmitter : undefined,
            provisionalReviewDate: this.props.provisional && this.props.provisional.provisionalDate ? this.props.provisional.provisionalDate : undefined,
            provisionalComment: this.props.provisional && this.props.provisional.provisionalComment ? this.props.provisional.provisionalComment : undefined,
            isProvisionalPreview: false
        });
    },

    /**
     * Method to handle editing provisional form
     */
    handleEditProvisional() {
        this.setState({isProvisionalPreview: false});
    },

    /**
     * Method to handle submitting provisional form
     */
    submitForm(e) {
        e.preventDefault();
        e.stopPropagation();
        let newProvisional = this.props.provisional.uuid ? curator.flatten(this.props.provisional) : {};
        newProvisional.classificationStatus = 'Provisional';
        newProvisional.provisionedClassification = true;
        newProvisional.provisionalSubmitter = this.state.provisionalSubmitter;
        newProvisional.provisionalDate = moment().toISOString();
        newProvisional.provisionalReviewDate = this.state.provisionalReviewDate;
        if (this.state.provisionalComment && this.state.provisionalComment.length) {
            newProvisional.provisionalComment = this.state.provisionalComment;
        } else {
            if (newProvisional.provisionalComment) {
                delete newProvisional['provisionalComment'];
            }
        }
        // Prevent users from incurring multiple submissions
        this.setState({submitBusy: true});
        if (this.props.gdm && Object.keys(this.props.gdm).length) {
            // Update existing provisional data object
            return this.putRestData('/provisional/' + this.props.provisional.uuid, newProvisional).then(data => {
                let provisionalClassification = data['@graph'][0];
                // this.props.updateProvisionalObj(provisionalClassification['@id']);
                // Record classification approval history
                let meta = {
                    provisionalClassification: {
                        gdm: this.props.gdm['@id'],
                        alteredClassification: provisionalClassification.alteredClassification,
                        classificationStatus: provisionalClassification.classificationStatus
                    }
                };
                // this.recordHistory('modify', provisionalClassification, meta);
                return Promise.resolve(provisionalClassification);
            }).then(result => {
                // get a fresh copy of the gdm object
                this.getRestData('/gdm/' + this.props.gdm.uuid).then(newGdm => {
                    let parentSnapshot = {gdm: newGdm};
                    let newSnapshot = {
                        resourceId: result.uuid,
                        resourceType: 'classification',
                        approvalStatus: 'Provisioned',
                        resource: result,
                        resourceParent: parentSnapshot
                    };
                    this.postRestData('/snapshot/', newSnapshot).then(response => {
                        let provisionalSnapshot = response['@graph'][0];
                        this.props.updateSnapshotList(provisionalSnapshot['@id']);
                        return Promise.resolve(provisionalSnapshot);
                    }).then(snapshot => {
                        let newClassification = curator.flatten(result);
                        let newSnapshot = curator.flatten(snapshot);
                        if ('associatedClassificationSnapshots' in newClassification) {
                            newClassification.associatedClassificationSnapshots.push(newSnapshot);
                        } else {
                            newClassification.associatedClassificationSnapshots = [];
                            newClassification.associatedClassificationSnapshots.push(newSnapshot);
                        }
                        this.putRestData(this.props.provisional['@id'], newClassification).then(provisionalObj => {
                            this.props.updateProvisionalObj(provisionalObj['@graph'][0]['@id']);
                        });
                    }).catch(err => {
                        console.log('Saving provisional snapshot error = : %o', err);
                    });
                });
            }).catch(err => {
                console.log('Classification provisional submission error = : %o', err);
            });
        } else if (this.props.interpretation && Object.keys(this.props.interpretation).length) {
            // Update existing classification data and its parent interpretation
            return this.putRestData('/provisional-variant/' + this.props.provisional.uuid, newProvisional).then(data => {
                let provisionalClassification = data['@graph'][0];
                // this.props.updateProvisionalObj(provisionalClassification['@id']);
                this.props.approveProvisional();
                // Record classification approval history
                let meta = {
                    provisionalClassification: {
                        interpretation: this.props.interpretation['@id'],
                        alteredClassification: provisionalClassification.alteredClassification,
                        classificationStatus: provisionalClassification.classificationStatus
                    }
                };
                // this.recordHistory('modify', provisionalClassification, meta);
                return Promise.resolve(provisionalClassification);
            }).then(result => {
                // get a fresh copy of the interpretation object
                this.getRestData('/interpretation/' + this.props.interpretation.uuid).then(newInterpretation => {
                    let parentSnapshot = {interpretation: newInterpretation};
                    let newSnapshot = {
                        resourceId: result.uuid,
                        resourceType: 'interpretation',
                        approvalStatus: 'Provisioned',
                        resource: result,
                        resourceParent: parentSnapshot
                    };
                    this.postRestData('/snapshot/', newSnapshot).then(response => {
                        let provisionalSnapshot = response['@graph'][0];
                        this.props.updateSnapshotList(provisionalSnapshot['@id']);
                        return Promise.resolve(provisionalSnapshot);
                    }).then(snapshot => {
                        let newClassification = curator.flatten(result);
                        let newSnapshot = curator.flatten(snapshot);
                        if ('associatedInterpretationSnapshots' in newClassification) {
                            newClassification.associatedInterpretationSnapshots.push(newSnapshot);
                        } else {
                            newClassification.associatedInterpretationSnapshots = [];
                            newClassification.associatedInterpretationSnapshots.push(newSnapshot);
                        }
                        this.putRestData(this.props.provisional['@id'], newClassification).then(provisionalObj => {
                            this.props.updateProvisionalObj(provisionalObj['@graph'][0]['@id']);
                        });
                    }).catch(err => {
                        console.log('Saving provisional snapshot error = : %o', err);
                    });
                });
            }).catch(err => {
                console.log('Interpretation classification provisional submission error = : %o', err);
            });
        }
    },

    render() {
        const provisionalSubmitter = this.state.provisionalSubmitter;
        const provisionalDate = this.state.provisionalDate ? moment(this.state.provisionalDate).format('YYYY MM DD, h:mm a') : moment().format('YYYY MM DD, h:mm a');
        const provisionalReviewDate = this.state.provisionalReviewDate ? moment(this.state.provisionalReviewDate).format('MM/DD/YYYY') : '';
        const provisionalComment = this.state.provisionalComment && this.state.provisionalComment.length ? this.state.provisionalComment : '';
        const session = this.props.session;
        const interpretation = this.props.interpretation;
        const provisional = this.props.provisional;
        const classification = this.props.classification;
        const affiliation = provisional.affiliation ? provisional.affiliation : (this.props.affiliation ? this.props.affiliation : null);
        const submitBusy = this.state.submitBusy;

        return (
            <div className="provisional-approval-panel-content">
                <Form submitHandler={this.submitForm} formClassName="form-horizontal form-std">
                    {this.state.isProvisionalPreview ?
                        <div className="provisional-preview">
                            <div className="col-md-12 provisional-form-content-wrapper">
                                <div className="col-xs-12 col-sm-4">
                                    <div className="provisional-affiliation">
                                        <dl className="inline-dl clearfix">
                                            <dt><span>ClinGen Affiliation:</span></dt>
                                            <dd>{affiliation ? getAffiliationName(affiliation) : null}</dd>
                                        </dl>
                                    </div>
                                    <div className="provisional-submitter">
                                        <dl className="inline-dl clearfix">
                                            <dt><span>Provisional Classification entered by:</span></dt>
                                            <dd>{provisionalSubmitter ? provisionalSubmitter : null}</dd>
                                        </dl>
                                    </div>
                                </div>
                                <div className="col-xs-12 col-sm-3">
                                    <div className="provisional-date">
                                        <dl className="inline-dl clearfix preview-provisional-date">
                                            <dt><span>Date saved as Provisional:</span></dt>
                                            <dd><span>{provisionalDate ? formatDate(parseDate(provisionalDate), "YYYY MMM DD, h:mm a") : null}</span></dd>
                                        </dl>
                                    </div>
                                    <div className="approval-review-date">
                                        <dl className="inline-dl clearfix preview-provisional-review-date">
                                            <dt><span>Date reviewed:</span></dt>
                                            <dd><span>{provisionalReviewDate ? formatDate(parseDate(provisionalReviewDate), "YYYY MMM DD") : null}</span></dd>
                                        </dl>
                                    </div>
                                </div>
                                <div className="col-xs-12 col-sm-5">
                                    <div className="provisional-comments">
                                        <dl className="inline-dl clearfix preview-provisional-comment">
                                            <dt><span>Additional comments:</span></dt>
                                            <dd><span>{provisionalComment ? provisionalComment : null}</span></dd>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                            <div className="col-md-12 alert alert-warning provisional-preview-note">
                                <i className="icon icon-exclamation-circle"></i> This is a Preview only; you must still Submit to save
                                this {interpretation && Object.keys(interpretation).length ? 'Interpretation' : 'Classification'} as Provisional.
                            </div>
                        </div>
                        :
                        <div className="provisional-edit">
                            <div className="col-md-12 provisional-form-content-wrapper">
                                <div className="col-xs-12 col-sm-4">
                                    <div className="provisional-affiliation">
                                        <dl className="inline-dl clearfix">
                                            <dt><span>ClinGen Affiliation:</span></dt>
                                            <dd>{affiliation ? getAffiliationName(affiliation) : null}</dd>
                                        </dl>
                                    </div>
                                    <div className="provisional-submitter">
                                        <dl className="inline-dl clearfix">
                                            <dt><span>Provisional Classification entered by:</span></dt>
                                            <dd>
                                                {provisionalSubmitter ?
                                                    provisionalSubmitter
                                                    :
                                                    <span className="provisional-submitter-placeholder-text">Current curator's name will be entered upon submission</span>
                                                }
                                            </dd>
                                        </dl>
                                    </div>
                                </div>
                                <div className="col-xs-12 col-sm-3">
                                    <div className="provisional-review-date">
                                        <div className="form-group">
                                            <label className="col-sm-5 control-label">Date reviewed:</label>
                                            <div className="col-sm-7">
                                                <DayPickerInput
                                                    value={provisionalReviewDate}
                                                    onDayChange={this.handleProvisionalReviewDateChange}
                                                    formatDate={formatDate}
                                                    parseDate={parseDate}
                                                    placeholder={`${formatDate(new Date())}`}
                                                    dayPickerProps={{
                                                        selectedDays: provisionalReviewDate ? parseDate(provisionalReviewDate) : undefined
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-xs-12 col-sm-5">
                                    <div className="provisional-comments">
                                        <Input type="textarea" ref={(input) => { this.provisionalCommentInput = input; }}
                                            label="Additional comments:" value={provisionalComment} rows="5"
                                            labelClassName="col-sm-5 control-label" wrapperClassName="col-sm-7" groupClassName="form-group" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    }
                    <div className="col-md-12 provisional-form-buttons-wrapper">
                        {this.state.isProvisionalPreview ?
                            <div className="button-group">
                                <button type="button" className="btn btn-default btn-inline-spacer"
                                    onClick={this.handleCancelProvisional} disabled={submitBusy}>
                                    Cancel Provisional
                                </button>
                                <button type="button" className="btn btn-info btn-inline-spacer"
                                    onClick={this.handleEditProvisional} disabled={submitBusy}>
                                    Edit <i className="icon icon-pencil"></i>
                                </button>
                                <button type="submit" className="btn btn-primary btn-inline-spacer pull-right" disabled={submitBusy}>
                                    {submitBusy ? <span className="submit-spinner"><i className="icon icon-spin icon-cog"></i></span> : null}
                                    Submit Provisional <i className="icon icon-check-square-o"></i>
                                </button>
                            </div>
                            :
                            <div className="button-group">
                                <button type="button" className="btn btn-default btn-inline-spacer pull-right"
                                    onClick={this.handlePreviewProvisional}>
                                    Preview Provisional
                                </button>
                            </div>
                        }
                    </div>
                </Form>
            </div>
        );
    }
});